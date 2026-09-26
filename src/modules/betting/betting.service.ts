import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';

import {
  bestQuote,
  collectQuotes,
  consensusChance,
  modelChance,
  type MarketQuotes,
  type Side,
} from '../../domain/cs-markets';
import {
  activeMapPool,
  buildRatings,
  habitPreference,
  mapHabits,
  mapWinChance,
  predictVeto,
  priorFromPoints,
  seriesOutlook,
  valueOf,
  type MapHabits,
  type MapResult,
  type Prior,
  type Ratings,
} from '../../domain/cs-model';
import { teamKey, type VrsTeam } from '../../domain/cs-teams';
import { BettingSyncService } from './betting-sync.service';
import { OddsPapiClient, type OddsFixture } from './clients/oddspapi.client';
import {
  PandaScoreClient,
  type ScheduledMatch,
  type ScheduledTeam,
} from './clients/pandascore.client';
import { VrsClient } from './clients/vrs.client';
import type {
  BettingOverviewDto,
  MarketOfferDto,
  MatchForecastDto,
  PlannedMapDto,
  TeamForecastDto,
} from './dto/betting.dto';
import { MapResultEntity } from './map-result.entity';

const TOP_TEAMS = 30;
const HISTORY_DAYS = 365;
const DAY_MS = 86_400_000;
const MODEL_TTL_MS = 10 * 60_000;
const FIXTURE_WINDOW_MS = 12 * 60 * 60_000;
const MIN_BOOKMAKERS = 3;
const MIN_EDGE = 0.02;
const KELLY_SHARE = 0.25;
const SUPPORTED_BEST_OF = new Set([1, 3, 5]);

interface Model {
  ratings: Ratings;
  results: MapResult[];
  pool: string[];
  habits: Map<string, MapHabits>;
  prior: Prior;
  vrs: Map<string, VrsTeam>;
  standingsDate: string | null;
}

const confidenceOf = (games: number): 'high' | 'medium' | 'low' =>
  games >= 40 ? 'high' : games >= 15 ? 'medium' : 'low';

@Injectable()
export class BettingService {
  private model: { at: number; value: Promise<Model> } | null = null;

  constructor(
    @InjectRepository(MapResultEntity) private readonly results: Repository<MapResultEntity>,
    private readonly sync: BettingSyncService,
    private readonly vrs: VrsClient,
    private readonly schedule: PandaScoreClient,
    private readonly odds: OddsPapiClient,
  ) {}

  async match(id: number): Promise<MatchForecastDto | null> {
    const overview = await this.overview();

    return overview.matches.find((match) => match.id === id) ?? null;
  }

  async overview(): Promise<BettingOverviewDto> {
    const [model, schedule, fixtures] = await Promise.all([
      this.loadModel(),
      this.schedule.schedule(),
      this.odds.fixtures(),
    ]);
    const featured = schedule.matches.filter((match) =>
      [match.team1, match.team2].some(
        (team) => (model.vrs.get(teamKey(team.name))?.rank ?? Infinity) <= TOP_TEAMS,
      ),
    );
    const forecasts = await Promise.all(
      featured.map((match) => this.forecast(match, model, fixtures)),
    );

    return {
      matches: forecasts.sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
      events: schedule.events,
      mapsKnown: model.results.length,
      mapPool: model.pool,
      standingsDate: model.standingsDate,
      sync: this.sync.status(),
      sources: { schedule: this.schedule.isEnabled, odds: this.odds.isEnabled },
    };
  }

  private loadModel(): Promise<Model> {
    if (this.model && Date.now() - this.model.at < MODEL_TTL_MS) {
      return this.model.value;
    }

    const value = this.buildModel();

    this.model = { at: Date.now(), value };
    value.catch(() => (this.model = null));
    return value;
  }

  private async buildModel(): Promise<Model> {
    const [rows, standings] = await Promise.all([
      this.results.find({
        where: { playedAt: MoreThan(new Date(Date.now() - HISTORY_DAYS * DAY_MS)) },
      }),
      this.vrs.standings(),
    ]);
    const vrs = new Map(
      (standings?.teams ?? []).map((team) => [teamKey(team.name), team] as const),
    );
    const prior: Prior = (team) => {
      const entry = vrs.get(team);

      return entry ? priorFromPoints(entry.points) : null;
    };
    const results: MapResult[] = rows.map((row) => ({
      playedAt: row.playedAt.toISOString(),
      team1: teamKey(row.team1),
      team2: teamKey(row.team2),
      map: row.map,
      winner: row.winner,
    }));

    const pool = activeMapPool(results, Date.now());

    return {
      ratings: buildRatings(results, prior),
      results,
      pool,
      habits: mapHabits(results, Date.now(), pool),
      prior,
      vrs,
      standingsDate: standings?.date ?? null,
    };
  }

  private team(model: Model, scheduled: ScheduledTeam): TeamForecastDto {
    const { name, image } = scheduled;
    const key = teamKey(name);
    const entry = model.vrs.get(key);
    const habits = model.habits.get(key);

    return {
      name,
      acronym: scheduled.acronym,
      image,
      rank: entry?.rank ?? null,
      points: entry?.points ?? null,
      roster: entry?.roster ?? [],
      mapGames: model.ratings.games.get(key) ?? 0,
      habits: model.pool
        .map((map) => ({
          map,
          share: habits?.shares.get(map) ?? 0,
          permaban: habitPreference(habits, map, model.pool.length) === -1,
        }))
        .sort((left, right) => right.share - left.share),
    };
  }

  private async forecast(
    match: ScheduledMatch,
    model: Model,
    fixtures: OddsFixture[],
  ): Promise<MatchForecastDto> {
    const first = teamKey(match.team1.name);
    const second = teamKey(match.team2.name);
    const team1 = this.team(model, match.team1);
    const team2 = this.team(model, match.team2);
    const bestOf = SUPPORTED_BEST_OF.has(match.bestOf) ? (match.bestOf as 1 | 3 | 5) : 3;
    const chance = (map: string) => mapWinChance(model.ratings, first, second, map, model.prior);
    const firstStarts = (team1.rank ?? Infinity) <= (team2.rank ?? Infinity);
    const starter = firstStarts ? first : second;
    const other = firstStarts ? second : first;
    const veto = predictVeto(
      model.pool,
      bestOf,
      (map) => (firstStarts ? chance(map) : 1 - chance(map)),
      (team, map) =>
        habitPreference(model.habits.get(team === 1 ? starter : other), map, model.pool.length),
    );
    const toFirst = (team: 1 | 2 | null): 1 | 2 | null =>
      team === null ? null : firstStarts ? team : team === 1 ? 2 : 1;
    const maps: PlannedMapDto[] = veto.maps.map((entry) => ({
      map: entry.map,
      pickedBy: toFirst(entry.pickedBy),
      chance: chance(entry.map),
      team1: model.ratings.maps.get(first)?.get(entry.map) ?? null,
      team2: model.ratings.maps.get(second)?.get(entry.map) ?? null,
    }));
    const mapChances = maps.map((entry) => entry.chance);
    const outlook = seriesOutlook(mapChances);
    const fixture = fixtures.find(
      (entry) =>
        Math.abs(Date.parse(entry.startsAt) - Date.parse(match.startsAt)) < FIXTURE_WINDOW_MS &&
        [teamKey(entry.team1), teamKey(entry.team2)].sort().join('|') ===
          [first, second].sort().join('|'),
    );
    const quotes = fixture
      ? collectQuotes(
          (await this.odds.odds(fixture.id)) as Parameters<typeof collectQuotes>[0],
          teamKey(fixture.team1) === second,
        )
      : [];
    const offers = quotes
      .flatMap((entry) => this.offers(entry, outlook, mapChances, bestOf))
      .sort((left, right) => right.expectedValue - left.expectedValue);
    const bestBet =
      offers.find(
        (offer) => offer.bookmakers >= MIN_BOOKMAKERS && offer.expectedValue > MIN_EDGE,
      ) ?? null;

    return {
      id: match.id,
      startsAt: match.startsAt,
      live: match.live,
      bestOf: match.bestOf,
      event: match.event,
      stage: match.stage,
      team1,
      team2,
      win: outlook.win,
      scores: outlook.scores,
      maps,
      vetoes: veto.actions.map((action) => ({ ...action, team: toFirst(action.team)! })),
      markets: offers,
      bestBet,
      oddsFound: fixture !== undefined,
      confidence: confidenceOf(Math.min(team1.mapGames, team2.mapGames)),
    };
  }

  private offers(
    quotes: MarketQuotes,
    outlook: ReturnType<typeof seriesOutlook>,
    mapChances: number[],
    bestOf: number,
  ): MarketOfferDto[] {
    const consensus = consensusChance(quotes);

    return ([1, 2] as Side[]).flatMap((side): MarketOfferDto[] => {
      const model = modelChance(quotes.market, side, outlook, mapChances, bestOf);
      const list = side === 1 ? quotes.first : quotes.second;
      const best = bestQuote(list);

      if (model === null || !best) return [];

      const market = consensus === null ? null : side === 1 ? consensus : 1 - consensus;
      const chance = market === null ? model : (model + market) / 2;
      const value = valueOf({
        market: quotes.market.kind,
        selection: String(side),
        chance,
        odds: best.price,
        bookmaker: best.bookmaker,
      });

      return [
        {
          kind: quotes.market.kind,
          line: quotes.market.line,
          mapIndex: quotes.market.mapIndex,
          side,
          model,
          market,
          chance,
          odds: best.price,
          bookmaker: best.bookmaker,
          bookmakers: list.length,
          expectedValue: value.expectedValue,
          stake: value.kelly * KELLY_SHARE,
        },
      ];
    });
  }
}

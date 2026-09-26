import { Inject, Injectable, Logger } from '@nestjs/common';

import { fetchJson } from '../../../common/http/fetch-json';
import { bettingConfig, type BettingConfig } from '../../../config/app.config';

const API_URL = 'https://api.pandascore.co/csgo';
const TTL_MS = 10 * 60_000;
const BIG_TIERS = 's,a';

interface RawTeam {
  id: number;
  name: string;
  acronym: string | null;
  image_url: string | null;
}

interface RawMatch {
  id: number;
  begin_at: string | null;
  scheduled_at: string | null;
  number_of_games: number;
  status: string;
  opponents: { opponent: RawTeam }[];
  league: { name: string; image_url: string | null };
  serie: { full_name: string | null };
  tournament: { name: string; tier: string | null };
}

interface RawTournament {
  id: number;
  tier: string | null;
  begin_at: string | null;
  end_at: string | null;
  league: { name: string; image_url: string | null };
  serie: { id: number; full_name: string | null; begin_at: string | null; end_at: string | null };
}

export interface ScheduledEvent {
  id: number;
  name: string;
  image: string | null;
  tier: string | null;
  beginsAt: string | null;
  endsAt: string | null;
}

export interface Schedule {
  matches: ScheduledMatch[];
  events: ScheduledEvent[];
}

export interface ScheduledTeam {
  name: string;
  acronym: string | null;
  image: string | null;
}

export interface ScheduledMatch {
  id: number;
  startsAt: string;
  bestOf: number;
  live: boolean;
  team1: ScheduledTeam;
  team2: ScheduledTeam;
  event: string;
  stage: string;
  tier: string | null;
}

const toTeam = (team: RawTeam): ScheduledTeam => ({
  name: team.name,
  acronym: team.acronym,
  image: team.image_url,
});

@Injectable()
export class PandaScoreClient {
  private readonly logger = new Logger(PandaScoreClient.name);
  private cached: { at: number; value: Schedule } | null = null;

  constructor(@Inject(bettingConfig.KEY) private readonly config: BettingConfig) {}

  get isEnabled(): boolean {
    return this.config.pandaScoreToken.length > 0;
  }

  async schedule(): Promise<Schedule> {
    if (!this.isEnabled) return { matches: [], events: [] };

    if (this.cached && Date.now() - this.cached.at < TTL_MS) {
      return this.cached.value;
    }

    try {
      const value = await this.load();

      this.cached = { at: Date.now(), value };
      return value;
    } catch (error) {
      this.logger.warn(`PandaScore schedule failed: ${String(error)}`);
      return this.cached?.value ?? { matches: [], events: [] };
    }
  }

  private get<T>(path: string, params: Record<string, string>): Promise<T> {
    return fetchJson<T>(`${API_URL}${path}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${this.config.pandaScoreToken}` },
      retries: 1,
    });
  }

  private async load(): Promise<Schedule> {
    const tournaments = (
      await Promise.all(
        ['running', 'upcoming'].map((kind) =>
          this.get<RawTournament[]>(`/tournaments/${kind}`, {
            'filter[tier]': BIG_TIERS,
            per_page: '100',
          }),
        ),
      )
    ).flat();

    if (tournaments.length === 0) return { matches: [], events: [] };

    const ids = tournaments.map((tournament) => tournament.id).join(',');
    const matches = (
      await Promise.all(
        ['running', 'upcoming'].map((kind) =>
          this.get<RawMatch[]>(`/matches/${kind}`, {
            'filter[tournament_id]': ids,
            per_page: '100',
            sort: 'begin_at',
          }),
        ),
      )
    ).flat();

    return {
      matches: matches.flatMap((match): ScheduledMatch[] => {
        const startsAt = match.begin_at ?? match.scheduled_at;
        const [first, second] = match.opponents.map((entry) => entry.opponent);

        if (!startsAt || !first || !second) return [];

        return [
          {
            id: match.id,
            startsAt,
            bestOf: match.number_of_games,
            live: match.status === 'running',
            team1: toTeam(first),
            team2: toTeam(second),
            event: match.league.name,
            stage: [match.serie.full_name, match.tournament.name].filter(Boolean).join(', '),
            tier: match.tournament.tier,
          },
        ];
      }),
      events: toEvents(tournaments),
    };
  }
}

const earliest = (dates: (string | null)[]): string | null =>
  dates.filter((date): date is string => !!date).sort()[0] ?? null;

const latest = (dates: (string | null)[]): string | null =>
  dates
    .filter((date): date is string => !!date)
    .sort()
    .at(-1) ?? null;

const toEvents = (tournaments: RawTournament[]): ScheduledEvent[] => {
  const bySerie = new Map<number, RawTournament[]>();

  for (const tournament of tournaments) {
    bySerie.set(tournament.serie.id, [...(bySerie.get(tournament.serie.id) ?? []), tournament]);
  }

  return [...bySerie.entries()]
    .map(([id, stages]) => {
      const [first] = stages;

      return {
        id,
        name: [first.league.name, first.serie.full_name].filter(Boolean).join(' '),
        image: first.league.image_url,
        tier: stages.some((stage) => stage.tier === 's') ? 's' : first.tier,
        beginsAt: first.serie.begin_at ?? earliest(stages.map((stage) => stage.begin_at)),
        endsAt: first.serie.end_at ?? latest(stages.map((stage) => stage.end_at)),
      };
    })
    .sort((left, right) => (left.beginsAt ?? '').localeCompare(right.beginsAt ?? ''));
};

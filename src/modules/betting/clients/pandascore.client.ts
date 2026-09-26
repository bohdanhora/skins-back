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
  private cached: { at: number; value: ScheduledMatch[] } | null = null;

  constructor(@Inject(bettingConfig.KEY) private readonly config: BettingConfig) {}

  get isEnabled(): boolean {
    return this.config.pandaScoreToken.length > 0;
  }

  async bigMatches(): Promise<ScheduledMatch[]> {
    if (!this.isEnabled) return [];

    if (this.cached && Date.now() - this.cached.at < TTL_MS) {
      return this.cached.value;
    }

    try {
      const value = await this.load();

      this.cached = { at: Date.now(), value };
      return value;
    } catch (error) {
      this.logger.warn(`PandaScore schedule failed: ${String(error)}`);
      return this.cached?.value ?? [];
    }
  }

  private get<T>(path: string, params: Record<string, string>): Promise<T> {
    return fetchJson<T>(`${API_URL}${path}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${this.config.pandaScoreToken}` },
      retries: 1,
    });
  }

  private async load(): Promise<ScheduledMatch[]> {
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

    if (tournaments.length === 0) return [];

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

    return matches.flatMap((match): ScheduledMatch[] => {
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
    });
  }
}

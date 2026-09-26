import { Inject, Injectable, Logger } from '@nestjs/common';

import { fetchJson, UpstreamError } from '../../../common/http/fetch-json';
import { bettingConfig, type BettingConfig } from '../../../config/app.config';

const API_URL = 'https://api.oddspapi.io/v4';
const CS_SPORT_ID = '17';
const FIXTURES_TTL_MS = 10 * 60_000;
const ODDS_TTL_MS = 5 * 60_000;
const DAY_MS = 86_400_000;
const WINDOW_DAYS = 9;
const NOT_FOUND = 404;

interface RawFixture {
  fixtureId: string;
  startTime: string;
  participant1Name: string;
  participant2Name: string;
  tournamentName: string;
  hasOdds: boolean;
}

interface RawOdds {
  bookmakerOdds?: Record<string, unknown>;
}

export interface OddsFixture {
  id: string;
  startsAt: string;
  team1: string;
  team2: string;
  tournament: string;
  hasOdds: boolean;
}

@Injectable()
export class OddsPapiClient {
  private readonly logger = new Logger(OddsPapiClient.name);
  private fixturesCache: { at: number; value: OddsFixture[] } | null = null;
  private readonly oddsCache = new Map<string, { at: number; value: Record<string, unknown> }>();

  constructor(@Inject(bettingConfig.KEY) private readonly config: BettingConfig) {}

  get isEnabled(): boolean {
    return this.config.oddsPapiKey.length > 0;
  }

  async fixtures(): Promise<OddsFixture[]> {
    if (!this.isEnabled) return [];

    if (this.fixturesCache && Date.now() - this.fixturesCache.at < FIXTURES_TTL_MS) {
      return this.fixturesCache.value;
    }

    try {
      const now = Date.now();
      const rows = await this.get<RawFixture[]>('/fixtures', {
        sportId: CS_SPORT_ID,
        from: new Date(now - DAY_MS / 4).toISOString(),
        to: new Date(now + WINDOW_DAYS * DAY_MS).toISOString(),
      }).catch((error: unknown) => {
        if (error instanceof UpstreamError && error.status === NOT_FOUND) return [];
        throw error;
      });
      const value = rows.map((row) => ({
        id: row.fixtureId,
        startsAt: row.startTime,
        team1: row.participant1Name,
        team2: row.participant2Name,
        tournament: row.tournamentName,
        hasOdds: row.hasOdds,
      }));

      this.fixturesCache = { at: Date.now(), value };
      return value;
    } catch (error) {
      this.logger.warn(`OddsPapi fixtures failed: ${String(error)}`);
      return this.fixturesCache?.value ?? [];
    }
  }

  async odds(fixtureId: string): Promise<Record<string, unknown>> {
    const cached = this.oddsCache.get(fixtureId);

    if (cached && Date.now() - cached.at < ODDS_TTL_MS) {
      return cached.value;
    }

    try {
      const data = await this.get<RawOdds>('/odds', { fixtureId });
      const value = data.bookmakerOdds ?? {};

      this.oddsCache.set(fixtureId, { at: Date.now(), value });
      return value;
    } catch (error) {
      this.logger.warn(`OddsPapi odds for ${fixtureId} failed: ${String(error)}`);
      return cached?.value ?? {};
    }
  }

  private get<T>(path: string, params: Record<string, string>): Promise<T> {
    const query = new URLSearchParams({ ...params, apiKey: this.config.oddsPapiKey });

    return fetchJson<T>(`${API_URL}${path}?${query}`, { retries: 1 });
  }
}

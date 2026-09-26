import { Injectable, Logger } from '@nestjs/common';

import { fetchJson, fetchText } from '../../../common/http/fetch-json';
import { parseVrsStandings, type VrsTeam } from '../../../domain/cs-teams';

const CONTENTS_URL =
  'https://api.github.com/repos/ValveSoftware/counter-strike_regional_standings/contents/live';
const TTL_MS = 12 * 60 * 60_000;
const HEADERS = { 'User-Agent': 'SkinScout/1.0' };

interface RawEntry {
  name: string;
  download_url: string | null;
}

export interface VrsStandings {
  date: string;
  teams: VrsTeam[];
}

@Injectable()
export class VrsClient {
  private readonly logger = new Logger(VrsClient.name);
  private cached: { at: number; value: VrsStandings } | null = null;

  async standings(): Promise<VrsStandings | null> {
    if (this.cached && Date.now() - this.cached.at < TTL_MS) {
      return this.cached.value;
    }

    try {
      const value = await this.load();

      this.cached = { at: Date.now(), value };
      return value;
    } catch (error) {
      this.logger.warn(`Valve standings failed: ${String(error)}`);
      return this.cached?.value ?? null;
    }
  }

  private async load(): Promise<VrsStandings> {
    const year = new Date().getUTCFullYear();

    for (const folder of [year, year - 1]) {
      const entries = await fetchJson<RawEntry[]>(`${CONTENTS_URL}/${folder}`, {
        headers: HEADERS,
        retries: 1,
      }).catch(() => [] as RawEntry[]);
      const latest = entries
        .filter((entry) => /^standings_global_\d{4}_\d{2}_\d{2}\.md$/.test(entry.name))
        .sort((left, right) => left.name.localeCompare(right.name))
        .at(-1);

      if (latest?.download_url) {
        const markdown = await fetchText(latest.download_url, { headers: HEADERS, retries: 1 });
        const date = latest.name
          .match(/(\d{4})_(\d{2})_(\d{2})/)!
          .slice(1)
          .join('-');

        return { date, teams: parseVrsStandings(markdown) };
      }
    }

    throw new Error('No standings published');
  }
}

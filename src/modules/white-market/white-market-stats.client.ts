import { Injectable } from '@nestjs/common';

import { fetchJson } from '../../common/http/fetch-json';
import { dollarsToCents } from '../../domain/listing';
import { parseVariantName, phaseLabel, type MarketPhase } from '../../domain/market-variant';
import {
  COMMON_DOPPLER_PHASES,
  hasDopplerPhases,
  mergeDailySales,
} from '../../domain/phase-prices';
import { type DailySales } from '../../domain/sales';

const GRAPHQL_URL = 'https://api.white.market/graphql/api';
const STATS_QUERY = `query MarketStatsProduct($appId: SteamApp!, $nameHash: String!, $phase: String) {
  market_stats_product(appId: $appId, nameHash: $nameHash, phase: $phase) { priceAvg volume date }
}`;
const HISTORY_DAYS = 56;
const DAY_MS = 86_400_000;

interface RawStatsResponse {
  data?: { market_stats_product?: { priceAvg: string; volume: number; date: string }[] | null };
}

@Injectable()
export class WhiteMarketStatsClient {
  async fetchDailySales(name: string): Promise<DailySales[]> {
    const { marketHashName, phase } = parseVariantName(name);
    const phases =
      phase !== null ? [phase] : hasDopplerPhases(marketHashName) ? COMMON_DOPPLER_PHASES : [null];
    const series = await Promise.all(phases.map((entry) => this.fetchStats(marketHashName, entry)));

    return mergeDailySales(series);
  }

  private async fetchStats(name: string, phase: MarketPhase | null): Promise<DailySales[]> {
    const response = await fetchJson<RawStatsResponse>(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://white.market' },
      body: JSON.stringify({
        query: STATS_QUERY,
        variables: {
          appId: 'CSGO',
          nameHash: name,
          ...(phase ? { phase: phaseLabel(phase) } : {}),
        },
      }),
      retries: 1,
    });
    const since = new Date(Date.now() - HISTORY_DAYS * DAY_MS).toISOString().slice(0, 10);

    return (response.data?.market_stats_product ?? [])
      .map((row) => ({
        day: row.date.slice(0, 10),
        average: dollarsToCents(row.priceAvg),
        count: row.volume,
      }))
      .filter((row) => row.day >= since && row.count > 0 && row.average > 0);
  }
}

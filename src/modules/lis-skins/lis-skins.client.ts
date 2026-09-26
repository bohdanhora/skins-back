import { Injectable } from '@nestjs/common';

import { fetchJson } from '../../common/http/fetch-json';
import { dollarsToCents } from '../../domain/listing';
import {
  isCommonDopplerPhase,
  normalizeMarketPhase,
  variantName,
  type MarketPhase,
} from '../../domain/market-variant';

const EXPORT_URL = 'https://lis-skins.com/market_export_json/csgo.json';
const EXPORT_TIMEOUT_MS = 120_000;
const PHASED_NAME =
  /^(.+\| (?:Gamma )?Doppler) (Phase [1-4]|Ruby|Sapphire|Emerald|Black Pearl)( \(.+\))$/;

export interface RawLisSkinsRow {
  name: string;
  price: number;
  unlocked_price?: number | null;
  url: string;
  count: number;
}

export interface LisSkinsPrice {
  price: number;
  listings: number;
  url: string;
}

export const splitLisSkinsName = (
  name: string,
): { marketHashName: string; phase: MarketPhase | null } => {
  const match = name.match(PHASED_NAME);
  const phase = match ? normalizeMarketPhase(match[2]) : null;

  return match && phase
    ? { marketHashName: `${match[1]}${match[3]}`, phase }
    : { marketHashName: name, phase: null };
};

export const mapLisSkinsPrices = (rows: RawLisSkinsRow[]): Map<string, LisSkinsPrice> => {
  const prices = new Map<string, LisSkinsPrice>();

  for (const row of rows) {
    const price = dollarsToCents(row.unlocked_price ?? row.price);

    if (!row.name || !Number.isFinite(price) || price <= 0 || !(row.count > 0)) {
      continue;
    }

    const { marketHashName, phase } = splitLisSkinsName(row.name);
    const value = { price, listings: row.count, url: row.url };

    prices.set(variantName(marketHashName, phase), value);

    if (phase && isCommonDopplerPhase(phase)) {
      const current = prices.get(marketHashName);

      prices.set(marketHashName, {
        price: Math.min(current?.price ?? Infinity, price),
        listings: (current?.listings ?? 0) + row.count,
        url: current && current.price <= price ? current.url : row.url,
      });
    }
  }

  return prices;
};

@Injectable()
export class LisSkinsClient {
  async fetchPrices(): Promise<Map<string, LisSkinsPrice>> {
    const rows = await fetchJson<RawLisSkinsRow[]>(EXPORT_URL, { timeoutMs: EXPORT_TIMEOUT_MS });

    return mapLisSkinsPrices(rows);
  }
}

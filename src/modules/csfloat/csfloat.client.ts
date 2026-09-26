import { Inject, Injectable } from '@nestjs/common';

import { fetchJson } from '../../common/http/fetch-json';
import { csfloatConfig, type CsfloatConfig } from '../../config/app.config';
import { type Listing, toStickerItemName } from '../../domain/listing';
import {
  COMMON_DOPPLER_PHASES,
  hasDopplerPhases,
  mergeDailySales,
} from '../../domain/phase-prices';
import { type DailySales } from '../../domain/sales';
import { MarketId } from '../../domain/market-links';
import {
  paintIndexForPhase,
  parseVariantName,
  phaseFromPaintIndex,
  type MarketPhase,
} from '../../domain/market-variant';

const LISTINGS_URL = 'https://csfloat.com/api/v1/listings';
const PRICE_LIST_URL = `${LISTINGS_URL}/price-list`;
const MAX_LISTINGS = 50;
const HISTORY_URL = 'https://csfloat.com/api/v1/history';
const HISTORY_DAYS = 56;
const DAY_MS = 86_400_000;

export interface RawCsfloatListing {
  id: string;
  price: number;
  item: {
    market_hash_name: string;
    float_value: number;
    paint_seed: number;
    paint_index: number;
    icon_url?: string;
    stickers?: { name: string; icon_url?: string }[];
    blue_gem?: RawBlueGem | null;
  };
}

interface RawBlueGem {
  playside_blue?: number;
  backside_blue?: number;
}

interface RawCsfloatSale extends RawCsfloatListing {
  sold_at?: string;
  reference?: {
    base_price?: number;
    predicted_price?: number;
    sticker_overpay?: { total_price?: number } | null;
  };
}

export interface CsfloatBlue {
  playside: number;
  backside: number;
}

export interface CsfloatSale {
  name: string;
  price: number;
  predicted: number;
  paintSeed: number;
  float: number;
  blue: CsfloatBlue | null;
  stickerValue: number;
  soldAt: string;
}

interface RawCsfloatResponse {
  data: RawCsfloatListing[];
  cursor?: string;
}

export interface CsfloatListing {
  id: string;
  price: number;
  float: number;
  paintSeed: number;
  phase: MarketPhase | null;
  url: string;
}

export interface CsfloatPatternListing {
  id: string;
  name: string;
  price: number;
  float: number;
  paintSeed: number;
  blue: CsfloatBlue | null;
  url: string;
}

export interface CsfloatPatternSearch {
  defIndex: number;
  paintIndex: number;
  paintSeed: number;
}

export interface CsfloatListingSearch {
  name: string;
  floatFrom?: number;
  floatTo?: number;
  phase?: MarketPhase | null;
}

export interface CsfloatMarketSearch {
  name?: string;
  namePrefix?: string;
  nameContains?: string;
  stickers?: string[];
  priceFrom?: number;
  priceTo?: number;
  limit: number;
}

export interface CsfloatPrice {
  price: number;
  listings: number;
  url?: string;
}

interface RawCsfloatPrice {
  market_hash_name: string;
  quantity: number;
  min_price: number;
}

interface RawCsfloatDay {
  day: string;
  count: number;
  avg_price: number;
}

interface RawCsfloatSchema {
  stickers: Record<string, { market_hash_name: string }>;
}

@Injectable()
export class CsfloatClient {
  private stickerIds: Promise<Map<string, number>> | null = null;

  constructor(@Inject(csfloatConfig.KEY) private readonly config: CsfloatConfig) {}

  get isEnabled(): boolean {
    return this.config.isEnabled;
  }

  async fetchPrices(): Promise<Map<string, CsfloatPrice>> {
    const rows = await fetchJson<RawCsfloatPrice[]>(PRICE_LIST_URL, {
      headers: this.config.apiKey ? { Authorization: this.config.apiKey } : undefined,
    });

    return new Map(
      rows
        .filter(
          (row) =>
            row.market_hash_name &&
            Number.isFinite(row.min_price) &&
            row.min_price > 0 &&
            Number.isFinite(row.quantity) &&
            row.quantity > 0,
        )
        .map((row) => [row.market_hash_name, { price: row.min_price, listings: row.quantity }]),
    );
  }

  async searchMarketListings(search: CsfloatMarketSearch): Promise<Listing[]> {
    const variant = search.name ? parseVariantName(search.name) : null;
    const query = new URLSearchParams({
      limit: String(Math.min(search.limit, MAX_LISTINGS)),
      sort_by: 'lowest_price',
      type: 'buy_now',
    });

    if (variant) query.set('market_hash_name', variant.marketHashName);
    if (variant?.phase) {
      const paintIndex = paintIndexForPhase(variant.marketHashName, variant.phase);

      if (paintIndex !== null) query.set('paint_index', String(paintIndex));
    }
    if (search.priceFrom !== undefined) query.set('min_price', String(search.priceFrom));
    if (search.priceTo !== undefined) query.set('max_price', String(search.priceTo));
    if (search.stickers?.length) {
      const ids = await this.resolveStickerIds(search.stickers);

      if (ids.length !== search.stickers.length) return [];

      query.set('stickers', JSON.stringify(ids.map((id) => ({ i: id }))));
      query.set('sticker_option', 'skins');
    }

    const response = await fetchJson<RawCsfloatListing[] | RawCsfloatResponse>(
      `${LISTINGS_URL}?${query}`,
      { headers: { Authorization: this.config.apiKey } },
    );
    const contains = search.nameContains?.toLowerCase();
    const prefix = search.namePrefix?.toLowerCase();

    return unwrapCsfloatListings(response)
      .filter(
        (row) => !variant?.phase || phaseFromPaintIndex(row.item.paint_index) === variant.phase,
      )
      .filter((row) => !contains || row.item.market_hash_name.toLowerCase().includes(contains))
      .filter((row) => !prefix || row.item.market_hash_name.toLowerCase().startsWith(prefix))
      .map((row) => ({
        market: MarketId.Csfloat,
        id: row.id,
        name: variant?.phase ? search.name! : row.item.market_hash_name,
        image: imageUrl(row.item.icon_url),
        price: row.price,
        float: Number.isFinite(row.item.float_value) ? String(row.item.float_value) : null,
        stickers: (row.item.stickers ?? []).map((sticker) => ({
          name: sticker.name,
          image: imageUrl(sticker.icon_url),
        })),
        url: `https://csfloat.com/item/${encodeURIComponent(row.id)}`,
      }));
  }

  async searchListings(search: CsfloatListingSearch): Promise<CsfloatListing[]> {
    const query = new URLSearchParams({
      market_hash_name: search.name,
      limit: String(MAX_LISTINGS),
      sort_by: 'lowest_price',
      type: 'buy_now',
    });

    if (search.floatFrom !== undefined) query.set('min_float', String(search.floatFrom));
    if (search.floatTo !== undefined) query.set('max_float', String(search.floatTo));
    if (search.phase) {
      const paintIndex = paintIndexForPhase(search.name, search.phase);

      if (paintIndex !== null) query.set('paint_index', String(paintIndex));
    }

    const response = await fetchJson<RawCsfloatListing[] | RawCsfloatResponse>(
      `${LISTINGS_URL}?${query}`,
      {
        headers: { Authorization: this.config.apiKey },
      },
    );
    const rows = unwrapCsfloatListings(response);

    return rows
      .map((row) => ({
        id: row.id,
        price: row.price,
        float: row.item.float_value,
        paintSeed: row.item.paint_seed,
        phase: phaseFromPaintIndex(row.item.paint_index),
        url: `https://csfloat.com/item/${encodeURIComponent(row.id)}`,
      }))
      .filter((row) => !search.phase || row.phase === search.phase);
  }

  async searchPatternListings(search: CsfloatPatternSearch): Promise<CsfloatPatternListing[]> {
    const query = new URLSearchParams({
      def_index: String(search.defIndex),
      paint_index: String(search.paintIndex),
      paint_seed: String(search.paintSeed),
      limit: String(MAX_LISTINGS),
      sort_by: 'lowest_price',
      type: 'buy_now',
    });
    const response = await fetchJson<RawCsfloatListing[] | RawCsfloatResponse>(
      `${LISTINGS_URL}?${query}`,
      { headers: { Authorization: this.config.apiKey }, retries: 0 },
    );

    return unwrapCsfloatListings(response)
      .filter((row) => row.item.paint_seed === search.paintSeed)
      .map((row) => ({
        id: row.id,
        name: row.item.market_hash_name,
        price: row.price,
        float: row.item.float_value,
        paintSeed: row.item.paint_seed,
        blue: readBlue(row.item.blue_gem),
        url: `https://csfloat.com/item/${encodeURIComponent(row.id)}`,
      }));
  }

  async fetchRecentSales(name: string): Promise<CsfloatSale[]> {
    const rows = await fetchJson<RawCsfloatSale[]>(
      `${HISTORY_URL}/${encodeURIComponent(name)}/sales`,
      { headers: { Authorization: this.config.apiKey }, retries: 0 },
    );

    return (Array.isArray(rows) ? rows : []).flatMap((row) => {
      const predicted = row.reference?.predicted_price ?? row.reference?.base_price;

      return predicted && row.sold_at
        ? [
            {
              name: row.item.market_hash_name,
              price: row.price,
              predicted,
              paintSeed: row.item.paint_seed,
              float: row.item.float_value,
              blue: readBlue(row.item.blue_gem),
              stickerValue: row.reference?.sticker_overpay?.total_price ?? 0,
              soldAt: row.sold_at,
            },
          ]
        : [];
    });
  }

  async fetchDailySales(name: string): Promise<DailySales[]> {
    const { marketHashName, phase } = parseVariantName(name);
    const phases =
      phase !== null ? [phase] : hasDopplerPhases(marketHashName) ? COMMON_DOPPLER_PHASES : [null];
    const series = await Promise.all(
      phases.map((entry) =>
        this.fetchGraph(
          marketHashName,
          entry === null ? null : paintIndexForPhase(marketHashName, entry),
        ),
      ),
    );

    return mergeDailySales(series);
  }

  private async fetchGraph(name: string, paintIndex: number | null): Promise<DailySales[]> {
    const query = paintIndex === null ? '' : `?paint_index=${paintIndex}`;
    const rows = await fetchJson<RawCsfloatDay[]>(
      `${HISTORY_URL}/${encodeURIComponent(name)}/graph${query}`,
      { headers: { Authorization: this.config.apiKey }, retries: 1 },
    );
    const since = new Date(Date.now() - HISTORY_DAYS * DAY_MS).toISOString().slice(0, 10);

    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        day: row.day.slice(0, 10),
        average: Math.round(row.avg_price),
        count: row.count,
      }))
      .filter((row) => row.day >= since && row.count > 0 && row.average > 0);
  }

  private async resolveStickerIds(names: string[]): Promise<number[]> {
    this.stickerIds ??= fetchJson<RawCsfloatSchema>('https://csfloat.com/api/v1/schema', {
      headers: { Authorization: this.config.apiKey },
    }).then(
      (schema) =>
        new Map(
          Object.entries(schema.stickers).map(([id, sticker]) => [
            sticker.market_hash_name.toLowerCase(),
            Number(id),
          ]),
        ),
    );
    const ids = await this.stickerIds;

    return names
      .map((name) => ids.get(toStickerItemName(name).toLowerCase()))
      .filter((id): id is number => id !== undefined);
  }
}

const imageUrl = (value?: string): string | null => {
  if (!value) return null;

  return value.startsWith('http')
    ? value
    : `https://community.akamai.steamstatic.com/economy/image/${value}`;
};

const readBlue = (raw: RawBlueGem | null | undefined): CsfloatBlue | null =>
  raw && typeof raw.playside_blue === 'number' && typeof raw.backside_blue === 'number'
    ? { playside: raw.playside_blue, backside: raw.backside_blue }
    : null;

export const unwrapCsfloatListings = (
  response: RawCsfloatListing[] | RawCsfloatResponse,
): RawCsfloatListing[] => (Array.isArray(response) ? response : response.data);

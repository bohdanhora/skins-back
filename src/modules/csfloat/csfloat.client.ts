import { Inject, Injectable } from '@nestjs/common';

import { UpstreamError } from '../../common/http/fetch-json';
import { RateGate, type RateSnapshot } from '../../domain/rate-gate';
import { csfloatConfig, type CsfloatConfig } from '../../config/app.config';
import { readPreview } from '../../domain/inspect-gen';
import {
  bySlot,
  placeFromPreview,
  type Listing,
  toStickerItemName,
  toStickerNumber,
  toStickerWear,
} from '../../domain/listing';
import {
  COMMON_DOPPLER_PHASES,
  hasDopplerPhases,
  mergeDailySales,
} from '../../domain/phase-prices';
import { type DailySales, type SalePrice } from '../../domain/sales';
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
    serialized_inspect?: string;
    inspect_link?: string;
    stickers?: {
      stickerId?: number;
      name: string;
      icon_url?: string;
      slot?: number;
      wear?: number;
      rotation?: number;
      scale?: number;
      offset_x?: number;
      offset_y?: number;
    }[];
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

export interface CsfloatLot {
  name: string;
  price: number;
  float: number | null;
  paintSeed: number | null;
  stickers: string[];
  image: string | null;
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

export interface CallOptions {
  background?: boolean;
  retries?: number;
}

export class CsfloatPausedError extends UpstreamError {
  constructor(
    url: string,
    readonly until: number,
  ) {
    super(url, TOO_MANY_REQUESTS, `paused until ${new Date(until).toISOString()}`);
    this.name = 'CsfloatPausedError';
  }
}

const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR_FLOOR = 500;
const USER_RESERVE = 40;
const FALLBACK_PAUSE_MS = 60_000;
const REQUEST_TIMEOUT_MS = 20_000;

@Injectable()
export class CsfloatClient {
  private stickerIds: Promise<Map<string, number>> | null = null;
  private readonly gate = new RateGate(USER_RESERVE, FALLBACK_PAUSE_MS);
  private readonly salesGate = new RateGate(USER_RESERVE, FALLBACK_PAUSE_MS);
  private readonly graphGate = new RateGate(USER_RESERVE, FALLBACK_PAUSE_MS);

  constructor(@Inject(csfloatConfig.KEY) private readonly config: CsfloatConfig) {}

  get isEnabled(): boolean {
    return this.config.isEnabled;
  }

  quota(): RateSnapshot {
    return this.gate.snapshot(Date.now());
  }

  private gateFor(url: string): RateGate {
    const path = new URL(url).pathname;

    if (path.startsWith('/api/v1/history/') && path.endsWith('/sales')) return this.salesGate;
    if (path.startsWith('/api/v1/history/') && path.endsWith('/graph')) return this.graphGate;

    return this.gate;
  }

  private async call<T>(url: string, options: CallOptions = {}): Promise<T> {
    const { background = false, retries = 1 } = options;
    const gate = this.gateFor(url);

    for (let attempt = 0; ; attempt += 1) {
      const until = gate.blockedUntil(background, Date.now());

      if (until !== null) throw new CsfloatPausedError(url, until);

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...(this.config.apiKey ? { Authorization: this.config.apiKey } : {}),
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      gate.record(
        {
          limit: response.headers.get('x-ratelimit-limit'),
          remaining: response.headers.get('x-ratelimit-remaining'),
          reset: response.headers.get('x-ratelimit-reset'),
        },
        response.status,
        Date.now(),
      );

      if (response.ok) return (await response.json()) as T;

      const body = await response.text().catch(() => '');

      if (response.status === TOO_MANY_REQUESTS) {
        throw new CsfloatPausedError(url, gate.blockedUntil(false, Date.now()) ?? Date.now());
      }

      if (response.status < SERVER_ERROR_FLOOR || attempt >= retries) {
        throw new UpstreamError(url, response.status, body);
      }
    }
  }

  async fetchPrices(): Promise<Map<string, CsfloatPrice>> {
    const rows = await this.call<RawCsfloatPrice[]>(PRICE_LIST_URL);

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

    const response = await this.call<RawCsfloatListing[] | RawCsfloatResponse>(
      `${LISTINGS_URL}?${query}`,
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
        paintSeed: Number.isInteger(row.item.paint_seed) ? row.item.paint_seed : null,
        stickers: placeFromPreview(
          (row.item.stickers ?? [])
            .map((sticker) => ({
              name: toStickerItemName(sticker.name),
              image: imageUrl(sticker.icon_url),
              slot: Number.isInteger(sticker.slot) ? sticker.slot! : null,
              wear: toStickerWear(sticker.wear),
              offsetX: toStickerNumber(sticker.offset_x),
              offsetY: toStickerNumber(sticker.offset_y),
              rotation: toStickerNumber(sticker.rotation),
              scale: toStickerNumber(sticker.scale),
            }))
            .sort(bySlot),
          readPreview(row.item.serialized_inspect ?? row.item.inspect_link),
          (row.item.stickers ?? [])
            .slice()
            .sort((left, right) => (left.slot ?? 0) - (right.slot ?? 0))
            .map((sticker) => sticker.stickerId ?? null),
        ),
        url: `https://csfloat.com/item/${encodeURIComponent(row.id)}`,
      }));
  }

  async searchListings(
    search: CsfloatListingSearch,
    options: CallOptions = {},
  ): Promise<CsfloatListing[]> {
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

    const response = await this.call<RawCsfloatListing[] | RawCsfloatResponse>(
      `${LISTINGS_URL}?${query}`,
      options,
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

  async searchPatternListings(
    search: CsfloatPatternSearch,
    options: CallOptions = {},
  ): Promise<CsfloatPatternListing[]> {
    const query = new URLSearchParams({
      def_index: String(search.defIndex),
      paint_index: String(search.paintIndex),
      paint_seed: String(search.paintSeed),
      limit: String(MAX_LISTINGS),
      sort_by: 'lowest_price',
      type: 'buy_now',
    });
    const response = await this.call<RawCsfloatListing[] | RawCsfloatResponse>(
      `${LISTINGS_URL}?${query}`,
      { retries: 0, ...options },
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

  async listing(id: string): Promise<CsfloatLot> {
    const row = await this.call<RawCsfloatListing>(`${LISTINGS_URL}/${encodeURIComponent(id)}`);

    return {
      name: row.item.market_hash_name,
      price: row.price,
      float: Number.isFinite(row.item.float_value) ? row.item.float_value : null,
      paintSeed: Number.isInteger(row.item.paint_seed) ? row.item.paint_seed : null,
      stickers: (row.item.stickers ?? []).map((sticker) => toStickerItemName(sticker.name)),
      image: imageUrl(row.item.icon_url),
    };
  }

  async fetchRecentSales(name: string, options: CallOptions = {}): Promise<CsfloatSale[]> {
    const rows = await this.call<RawCsfloatSale[]>(
      `${HISTORY_URL}/${encodeURIComponent(name)}/sales`,
      { retries: 0, ...options },
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

  async fetchSalePrices(name: string, options: CallOptions = {}): Promise<SalePrice[]> {
    const { marketHashName, phase } = parseVariantName(name);
    const paintIndex = phase ? paintIndexForPhase(marketHashName, phase) : null;
    const query = paintIndex === null ? '' : `?paint_index=${paintIndex}`;
    const rows = await this.call<RawCsfloatSale[]>(
      `${HISTORY_URL}/${encodeURIComponent(marketHashName)}/sales${query}`,
      { retries: 0, ...options },
    );

    return (Array.isArray(rows) ? rows : []).flatMap((row) => {
      const at = row.sold_at ? Date.parse(row.sold_at) : NaN;

      return row.price > 0 && Number.isFinite(at) ? [{ price: row.price, at }] : [];
    });
  }

  async fetchDailySales(name: string, options: CallOptions = {}): Promise<DailySales[]> {
    const { marketHashName, phase } = parseVariantName(name);
    const phases =
      phase !== null ? [phase] : hasDopplerPhases(marketHashName) ? COMMON_DOPPLER_PHASES : [null];
    const series = await Promise.all(
      phases.map((entry) =>
        this.fetchGraph(
          marketHashName,
          entry === null ? null : paintIndexForPhase(marketHashName, entry),
          options,
        ),
      ),
    );

    return mergeDailySales(series);
  }

  private async fetchGraph(
    name: string,
    paintIndex: number | null,
    options: CallOptions,
  ): Promise<DailySales[]> {
    const query = paintIndex === null ? '' : `?paint_index=${paintIndex}`;
    const rows = await this.call<RawCsfloatDay[]>(
      `${HISTORY_URL}/${encodeURIComponent(name)}/graph${query}`,
      options,
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
    this.stickerIds ??= this.call<RawCsfloatSchema>('https://csfloat.com/api/v1/schema')
      .then(
        (schema) =>
          new Map(
            Object.entries(schema.stickers).map(([id, sticker]) => [
              sticker.market_hash_name.toLowerCase(),
              Number(id),
            ]),
          ),
      )
      .catch((error: unknown) => {
        this.stickerIds = null;
        throw error;
      });
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

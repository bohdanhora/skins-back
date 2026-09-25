import { Injectable } from '@nestjs/common';

import { fetchJson } from '../../common/http/fetch-json';
import { type DepthOffer, type DepthOrder } from '../../domain/float-snipes';
import { normalizeMarketPhase } from '../../domain/market-variant';
import { DmarketRateLimiter, type RequestPriority } from './dmarket-rate-limiter';

const DEPTH_URL = 'https://api.dmarket.com/marketplace-api/v1/market-depth';
const CS2_GAME_ID = 'a8db';
const ANY = 'any';

interface RawAttributes {
  floatValue?: string;
  paintSeed?: string;
  phaseTitle?: string;
  floatPartValue?: string;
}

interface RawLevel {
  price: string;
  amount: string;
  attributes: RawAttributes[];
}

interface RawDepth {
  offers?: RawLevel[];
  orders?: RawLevel[];
}

const toNumber = (value: string | undefined): number | null => {
  const parsed = Number(value);

  return value !== undefined && value !== '' && value !== ANY && Number.isFinite(parsed)
    ? parsed
    : null;
};

const condition = (value: string | undefined): string | null =>
  value && value !== ANY ? value : null;

@Injectable()
export class DmarketDepthClient {
  constructor(private readonly limiter: DmarketRateLimiter) {}

  async fetch(
    title: string,
    priority: RequestPriority = 'interactive',
  ): Promise<{ offers: DepthOffer[]; orders: DepthOrder[] }> {
    const query = new URLSearchParams({ gameId: CS2_GAME_ID, title });
    const raw = await this.limiter.schedule(
      () => fetchJson<RawDepth>(`${DEPTH_URL}?${query.toString()}`, { retries: 1 }),
      priority,
    );

    const offers = (raw.offers ?? []).flatMap((level) => {
      const price = Number(level.price);
      const attributes = level.attributes.length > 0 ? level.attributes : [{}];

      return attributes.map((attribute: RawAttributes) => ({
        price,
        float: toNumber(attribute.floatValue),
        paintSeed: toNumber(attribute.paintSeed),
        phase: normalizeMarketPhase(attribute.phaseTitle),
      }));
    });

    const orders = (raw.orders ?? []).map((level) => {
      const attribute: RawAttributes = level.attributes[0] ?? {};

      return {
        price: Number(level.price),
        amount: Number(level.amount),
        floatPart: condition(attribute.floatPartValue),
        paintSeed: toNumber(attribute.paintSeed),
        phase: normalizeMarketPhase(attribute.phaseTitle),
      };
    });

    return { offers, orders };
  }
}

import { Inject, Injectable } from '@nestjs/common';

import { fetchJson } from '../../common/http/fetch-json';
import { dmarketConfig, type DmarketConfig } from '../../config/app.config';
import { readPreview } from '../../domain/inspect-gen';
import {
  dollarsToCents,
  placeFromPreview,
  toStickerItemName,
  toStickerNumber,
  toStickerWear,
  withoutStickerPrefix,
  type Listing,
} from '../../domain/listing';
import { MarketId, dmarketListingUrl } from '../../domain/market-links';
import { normalizeMarketPhase, parseVariantName } from '../../domain/market-variant';
import { type SalePrice } from '../../domain/sales';
import { DmarketRateLimiter, type RequestPriority } from './dmarket-rate-limiter';
import { DmarketSigner } from './dmarket-signer';

const API_ORIGIN = 'https://api.dmarket.com';
const OFFERS_PATH = '/marketplace-api/v2/offers';
const LAST_SALES_PATH = '/trade-aggregator/v1/last-sales';
const LAST_SALES_LIMIT = 500;

interface RawLastSales {
  sales?: { price: string; date: string; offerAttributes?: { phaseTitle?: string } }[];
}
const CS2_GAME_ID = 'a8db';
const MAX_LIMIT = 100;

interface RawOffer {
  offerId: string;
  priceCents: string;
  attributes: {
    title: string;
    imageUri: string;
    cs2?: {
      float?: string;
      paintSeed?: number;
      inspectInGameUri?: string;
      stickers?: {
        id?: number;
        name: string;
        image: string;
        slot?: number;
        wear?: string;
        rotation?: string;
        offsetX?: number;
        offsetY?: number;
      }[];
    };
  };
}

export interface DmarketListingSearch {
  name?: string;
  namePrefix?: string;
  stickers?: string[];
  priceFrom?: number;
  priceTo?: number;
  limit: number;
}

const filterValue = (value: string): string => value.replaceAll(',', ' ');

@Injectable()
export class DmarketTradingClient {
  private readonly signer: DmarketSigner | null;

  constructor(
    @Inject(dmarketConfig.KEY) config: DmarketConfig,
    private readonly limiter: DmarketRateLimiter,
  ) {
    this.signer = config.isTradingEnabled
      ? new DmarketSigner(config.publicKey, config.secretKey)
      : null;
  }

  get isEnabled(): boolean {
    return this.signer !== null;
  }

  async searchListings(search: DmarketListingSearch): Promise<Listing[]> {
    const offers = await this.fetchOffers(search, (name) => name);

    if (offers.length === 0 && search.stickers?.length) {
      return this.fetchOffers(search, (name) => name.toLowerCase());
    }

    return offers;
  }

  private async fetchOffers(
    search: DmarketListingSearch,
    stickerCase: (name: string) => string,
  ): Promise<Listing[]> {
    const query = new URLSearchParams({
      gameId: CS2_GAME_ID,
      limit: String(Math.min(search.limit, MAX_LIMIT)),
      orderBy: 'price',
      orderDir: 'asc',
      withImages: 'true',
    });

    const title = search.name ?? search.namePrefix;

    if (title) {
      query.set('title', title);
    }

    if (search.stickers?.length) {
      query.set(
        'treeFilters',
        search.stickers
          .map((sticker) => `sticker[]=${filterValue(stickerCase(withoutStickerPrefix(sticker)))}`)
          .join(','),
      );
    }

    if (search.priceFrom !== undefined) {
      query.set('priceFrom', String(search.priceFrom));
    }

    if (search.priceTo !== undefined) {
      query.set('priceTo', String(search.priceTo));
    }

    const response = await this.get<{ items: RawOffer[] }>(`${OFFERS_PATH}?${query.toString()}`);
    const offers = response.items.map((offer) => this.toListing(offer));

    return search.name ? offers.filter((offer) => offer.name === search.name) : offers;
  }

  private toListing(offer: RawOffer): Listing {
    const { title, imageUri, cs2 } = offer.attributes;

    return {
      market: MarketId.Dmarket,
      id: offer.offerId,
      name: title,
      image: imageUri || null,
      price: Number(offer.priceCents),
      float: cs2?.float ?? null,
      paintSeed: Number.isInteger(cs2?.paintSeed) ? cs2!.paintSeed! : null,
      stickers: placeFromPreview(
        (cs2?.stickers ?? []).map((sticker) => ({
          name: toStickerItemName(sticker.name),
          image: sticker.image || null,
          slot: null,
          wear: toStickerWear(sticker.wear),
          offsetX: toStickerNumber(sticker.offsetX),
          offsetY: toStickerNumber(sticker.offsetY),
          rotation: toStickerNumber(sticker.rotation),
          scale: null,
        })),
        readPreview(cs2?.inspectInGameUri),
        (cs2?.stickers ?? []).map((sticker) => sticker.id ?? null),
      ),
      url: dmarketListingUrl(title, cs2?.float ?? null),
    };
  }

  async fetchSalePrices(
    name: string,
    priority: RequestPriority = 'background',
  ): Promise<SalePrice[]> {
    const { marketHashName, phase } = parseVariantName(name);
    const query = new URLSearchParams({
      gameId: CS2_GAME_ID,
      title: marketHashName,
      limit: String(LAST_SALES_LIMIT),
    });
    const response = await this.get<RawLastSales>(
      `${LAST_SALES_PATH}?${query.toString()}`,
      priority,
    );

    return (response.sales ?? []).flatMap((sale) => {
      const price = dollarsToCents(sale.price);
      const at = Number(sale.date) * 1000;
      const salePhase = normalizeMarketPhase(sale.offerAttributes?.phaseTitle);

      return price > 0 && Number.isFinite(at) && (!phase || salePhase === phase)
        ? [{ price, at }]
        : [];
    });
  }

  private async get<T>(
    pathWithQuery: string,
    priority: RequestPriority = 'interactive',
  ): Promise<T> {
    if (!this.signer) {
      throw new Error('DMarket API keys are not configured');
    }

    const signer = this.signer;

    return this.limiter.schedule(
      () =>
        fetchJson<T>(`${API_ORIGIN}${pathWithQuery}`, {
          headers: { ...signer.sign('GET', pathWithQuery) },
          retries: 1,
        }),
      priority,
    );
  }
}

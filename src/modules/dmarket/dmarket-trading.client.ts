import { Inject, Injectable } from '@nestjs/common';

import { fetchJson } from '../../common/http/fetch-json';
import { dmarketConfig, type DmarketConfig } from '../../config/app.config';
import { toStickerItemName, withoutStickerPrefix, type Listing } from '../../domain/listing';
import { MarketId, dmarketListingUrl } from '../../domain/market-links';
import { DmarketRateLimiter } from './dmarket-rate-limiter';
import { DmarketSigner } from './dmarket-signer';

const API_ORIGIN = 'https://api.dmarket.com';
const OFFERS_PATH = '/marketplace-api/v2/offers';
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
      stickers?: { name: string; image: string }[];
    };
  };
}

export interface DmarketListingSearch {
  /** Exact market name. */
  name?: string;
  /** The start of a name, e.g. "AK-47" or "AK-47 | Redline": every matching item. */
  namePrefix?: string;
  stickers?: string[];
  priceFrom?: number;
  priceTo?: number;
  limit: number;
}

/** The comma separates filters inside `treeFilters`, so it cannot appear in a value. */
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

    // The site filters by the plain sticker name, but the stored value may be lowercase.
    // An empty answer for a sticker search gets one retry in lowercase.
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

    // `title` is a prefix match, so "AK-47 | Redline" would also bring StatTrak and other wears.
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
      stickers: (cs2?.stickers ?? []).map((sticker) => ({
        name: toStickerItemName(sticker.name),
        image: sticker.image || null,
      })),
      url: dmarketListingUrl(title, cs2?.float ?? null),
    };
  }

  private async get<T>(pathWithQuery: string): Promise<T> {
    if (!this.signer) {
      throw new Error('DMarket API keys are not configured');
    }

    const signer = this.signer;

    // Signed at send time: DMarket rejects signatures older than two minutes.
    return this.limiter.schedule(() =>
      fetchJson<T>(`${API_ORIGIN}${pathWithQuery}`, {
        headers: { ...signer.sign('GET', pathWithQuery) },
        retries: 1,
      }),
    );
  }
}

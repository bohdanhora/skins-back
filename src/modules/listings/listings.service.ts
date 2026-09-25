import { Injectable, Logger } from '@nestjs/common';

import { type Listing } from '../../domain/listing';
import { compareStickerDeals, evaluateStickerDeal } from '../../domain/sticker-deals';
import { DmarketTradingClient } from '../dmarket/dmarket-trading.client';
import { ItemIndexService } from '../items/item-index.service';
import { WhiteMarketPartnerClient } from '../white-market/white-market-partner.client';
import {
  SourceStatus,
  type ListingViewDto,
  type ListingsDto,
  type SourceStateDto,
} from './dto/listings.dto';

export type ListingSort = 'price' | 'deal' | 'overpay';

export interface ListingSearch {
  /** Exact market name. */
  name?: string;
  /** Any part of a name, e.g. "AK-47" or "Redline". Ignored when `name` is set. */
  item?: string;
  stickers?: string[];
  priceFrom?: number;
  priceTo?: number;
  sort?: ListingSort;
  limit: number;
}

/** What each market client receives once the item text is understood. */
interface SourceSearch {
  name?: string;
  namePrefix?: string;
  nameContains?: string;
  stickers?: string[];
  priceFrom?: number;
  priceTo?: number;
  limit: number;
}

interface Source {
  isEnabled: boolean;
  searchListings: (search: SourceSearch) => Promise<Listing[]>;
}

/** Both markets answer at most 100 listings per request: rank the whole page, not just the first few. */
const RANKING_POOL = 100;

/** Individual listings with float and stickers. Needs the optional keys of each market. */
@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  constructor(
    private readonly whiteMarket: WhiteMarketPartnerClient,
    private readonly dmarket: DmarketTradingClient,
    private readonly index: ItemIndexService,
  ) {}

  async search(search: ListingSearch): Promise<ListingsDto> {
    const sourceSearch = this.understand(search);
    const [whiteMarket, dmarket] = await Promise.all([
      this.collect('white.market', this.whiteMarket, sourceSearch),
      this.collect('DMarket', this.dmarket, sourceSearch),
    ]);
    const needle = sourceSearch.name ? null : search.item?.trim().toLowerCase();
    const wanted = search.stickers ?? [];

    const listings = [...whiteMarket.listings, ...dmarket.listings]
      .filter((listing) => !needle || listing.name.toLowerCase().includes(needle))
      .map((listing) => this.toView(listing, wanted))
      .sort(this.comparator(search.sort ?? 'price'))
      .slice(0, search.limit);

    return { sources: { whiteMarket: whiteMarket.state, dmarket: dmarket.state }, listings };
  }

  /**
   * An exact name is passed as is. Free text becomes a title prefix for DMarket
   * when some item name starts with it; white.market gets it as a loose search.
   * Either way the result is filtered by the text afterwards.
   */
  private understand(search: ListingSearch): SourceSearch {
    const base = {
      stickers: search.stickers,
      priceFrom: search.priceFrom,
      priceTo: search.priceTo,
      limit: search.sort && search.sort !== 'price' ? RANKING_POOL : search.limit,
    };
    const text = search.item?.trim();

    if (search.name || !text) {
      return { ...base, name: search.name };
    }

    if (this.index.find(text)) {
      return { ...base, name: text, limit: RANKING_POOL };
    }

    const lower = text.toLowerCase();
    const isPrefix = this.index.all().some((row) => row.searchName.startsWith(lower));

    return {
      ...base,
      limit: RANKING_POOL,
      nameContains: text,
      ...(isPrefix ? { namePrefix: text } : {}),
    };
  }

  private comparator(sort: ListingSort): (left: ListingViewDto, right: ListingViewDto) => number {
    switch (sort) {
      case 'deal':
        return compareStickerDeals;
      case 'overpay':
        return (left, right) =>
          (left.overpay ?? Infinity) - (right.overpay ?? Infinity) || left.price - right.price;
      default:
        return (left, right) => left.price - right.price;
    }
  }

  private async collect(
    label: string,
    source: Source,
    search: SourceSearch,
  ): Promise<{ state: SourceStateDto; listings: Listing[] }> {
    if (!source.isEnabled) {
      return { state: { status: SourceStatus.NoKeys, message: null }, listings: [] };
    }

    try {
      const listings = await source.searchListings(search);

      return { state: { status: SourceStatus.Ok, message: null }, listings };
    } catch (error) {
      this.logger.warn(`${label} listings failed: ${String(error)}`);

      return {
        state: { status: SourceStatus.Error, message: `${label} is not responding right now` },
        listings: [],
      };
    }
  }

  private toView(listing: Listing, wanted: string[]): ListingViewDto {
    const stickers = listing.stickers.map((sticker) => ({
      ...sticker,
      price: this.index.cheapestPrice(sticker.name),
    }));

    return {
      ...listing,
      ...evaluateStickerDeal(
        listing.price,
        this.index.cheapestPrice(listing.name),
        stickers,
        wanted,
      ),
      image: listing.image ?? this.index.find(listing.name)?.image ?? null,
      stickers,
      stickersValue: stickers.reduce((sum, sticker) => sum + (sticker.price ?? 0), 0),
    };
  }
}

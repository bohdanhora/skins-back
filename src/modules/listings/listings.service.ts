import { Injectable, Logger } from '@nestjs/common';

import { type Listing } from '../../domain/listing';
import { DmarketTradingClient } from '../dmarket/dmarket-trading.client';
import { ItemIndexService } from '../items/item-index.service';
import { WhiteMarketPartnerClient } from '../white-market/white-market-partner.client';
import {
  SourceStatus,
  type ListingViewDto,
  type ListingsDto,
  type SourceStateDto,
} from './dto/listings.dto';

export interface ListingSearch {
  name?: string;
  stickers?: string[];
  priceFrom?: number;
  priceTo?: number;
  limit: number;
}

interface Source {
  isEnabled: boolean;
  searchListings: (search: ListingSearch) => Promise<Listing[]>;
}

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
    const [whiteMarket, dmarket] = await Promise.all([
      this.collect('white.market', this.whiteMarket, search),
      this.collect('DMarket', this.dmarket, search),
    ]);

    const listings = [...whiteMarket.listings, ...dmarket.listings]
      .map((listing) => this.toView(listing))
      .sort((left, right) => left.price - right.price)
      .slice(0, search.limit);

    return { sources: { whiteMarket: whiteMarket.state, dmarket: dmarket.state }, listings };
  }

  private async collect(
    label: string,
    source: Source,
    search: ListingSearch,
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

  private toView(listing: Listing): ListingViewDto {
    const stickers = listing.stickers.map((sticker) => ({
      ...sticker,
      price: this.index.cheapestPrice(sticker.name),
    }));

    return {
      ...listing,
      image: listing.image ?? this.index.find(listing.name)?.image ?? null,
      stickers,
      stickersValue: stickers.reduce((sum, sticker) => sum + (sticker.price ?? 0), 0),
    };
  }
}

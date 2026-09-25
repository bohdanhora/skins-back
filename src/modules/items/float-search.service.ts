import { Injectable, Logger } from '@nestjs/common';

import { DMARKET_FLOAT_PARTS, inRange, overlaps } from '../../domain/float';
import { MarketId, dmarketListingUrl, whiteMarketItemUrl } from '../../domain/market-links';
import { DmarketDepthClient } from '../dmarket/dmarket-depth.client';
import { SourceStatus } from '../listings/dto/listings.dto';
import { PriceBoardService } from '../prices/price-board.service';
import { WhiteMarketPartnerClient } from '../white-market/white-market-partner.client';
import {
  type FloatBuyOrderDto,
  type FloatListingDto,
  type FloatSearchDto,
  type FloatSearchQueryDto,
  type FloatSourceDto,
} from './dto/float-search.dto';

const LISTINGS_PER_MARKET = 40;
const MAX_ORDERS = 12;

const EMPTY: Omit<FloatSourceDto, 'status'> = { listings: [], total: 0 };

/**
 * Finds listings inside a float range on both markets. DMarket shows every
 * listing's float publicly; white.market needs the partner key for that.
 */
@Injectable()
export class FloatSearchService {
  private readonly logger = new Logger(FloatSearchService.name);

  constructor(
    private readonly depth: DmarketDepthClient,
    private readonly whiteMarket: WhiteMarketPartnerClient,
    private readonly board: PriceBoardService,
  ) {}

  async search(query: FloatSearchQueryDto): Promise<FloatSearchDto> {
    const { name, floatFrom, floatTo } = query;
    const [dmarket, whiteMarket] = await Promise.all([
      this.searchDmarket(name, floatFrom, floatTo),
      this.searchWhiteMarket(name, floatFrom, floatTo),
    ]);

    const exported = this.board.whiteMarketPrice(name);
    const item = this.board.find(name);
    const anyFloat = [
      item?.whiteMarket?.listings ? item.whiteMarket.price : null,
      item?.dmarket?.listings ? item.dmarket.price : null,
    ].filter((price): price is number => price !== null);

    return {
      dmarket: dmarket.source,
      whiteMarket,
      whiteMarketCheapest: exported
        ? {
            market: MarketId.WhiteMarket,
            price: exported.price,
            float: exported.cheapestFloat,
            paintSeed: null,
            url: exported.url,
          }
        : null,
      orders: dmarket.orders,
      cheapestAnyFloat: anyFloat.length > 0 ? Math.min(...anyFloat) : null,
    };
  }

  private async searchDmarket(
    name: string,
    from?: number,
    to?: number,
  ): Promise<{ source: FloatSourceDto; orders: FloatBuyOrderDto[] }> {
    try {
      const { offers, orders } = await this.depth.fetch(name);
      const matching = offers
        .filter((offer) => offer.float !== null && inRange(offer.float, from, to))
        .sort((left, right) => left.price - right.price || left.float! - right.float!);

      return {
        source: {
          status: SourceStatus.Ok,
          total: matching.length,
          listings: matching.slice(0, LISTINGS_PER_MARKET).map((offer) => ({
            market: MarketId.Dmarket,
            price: offer.price,
            float: offer.float,
            paintSeed: offer.paintSeed,
            url: dmarketListingUrl(name, offer.float),
          })),
        },
        orders: orders
          // Orders tied to one pattern or Doppler phase are collector hunts, not float orders.
          .filter((order) => order.paintSeed === null && order.phase === null)
          .map((order) => ({
            price: order.price,
            amount: order.amount,
            floatPart: order.floatPart,
            range: order.floatPart ? [...(DMARKET_FLOAT_PARTS[order.floatPart] ?? [0, 1])] : null,
          }))
          .filter((order) => !order.range || overlaps([order.range[0], order.range[1]], from, to))
          .sort((left, right) => right.price - left.price)
          .slice(0, MAX_ORDERS) as FloatBuyOrderDto[],
      };
    } catch (error) {
      this.logger.warn(`DMarket depth for "${name}" failed: ${String(error)}`);

      return { source: { status: SourceStatus.Error, ...EMPTY }, orders: [] };
    }
  }

  private async searchWhiteMarket(
    name: string,
    from?: number,
    to?: number,
  ): Promise<FloatSourceDto> {
    if (!this.whiteMarket.isEnabled) {
      return { status: SourceStatus.NoKeys, ...EMPTY };
    }

    try {
      const listings = await this.whiteMarket.searchListings({
        name,
        floatFrom: from,
        floatTo: to,
        limit: LISTINGS_PER_MARKET,
      });
      const mapped: FloatListingDto[] = listings.map((listing) => ({
        market: MarketId.WhiteMarket,
        price: listing.price,
        float: listing.float === null ? null : Number(listing.float),
        paintSeed: null,
        url: whiteMarketItemUrl(name),
      }));

      return { status: SourceStatus.Ok, listings: mapped, total: mapped.length };
    } catch (error) {
      this.logger.warn(`white.market float search for "${name}" failed: ${String(error)}`);

      return { status: SourceStatus.Error, ...EMPTY };
    }
  }
}

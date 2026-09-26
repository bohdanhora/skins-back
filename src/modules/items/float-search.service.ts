import { Injectable, Logger } from '@nestjs/common';

import { blueShare } from '../../domain/blue-gem';
import { DMARKET_FLOAT_PARTS, inRange, overlaps } from '../../domain/float';
import { liveOrders } from '../../domain/float-snipes';
import { MarketId, dmarketListingUrl } from '../../domain/market-links';
import { parseVariantName, type MarketPhase } from '../../domain/market-variant';
import { CsfloatClient } from '../csfloat/csfloat.client';
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
  type SteamSourceDto,
} from './dto/float-search.dto';
import { SteamMarketClient } from '../steam/steam-market.client';

const LISTINGS_PER_MARKET = 40;
const MAX_ORDERS = 12;

const EMPTY: Omit<FloatSourceDto, 'status'> = { listings: [], total: 0 };

@Injectable()
export class FloatSearchService {
  private readonly logger = new Logger(FloatSearchService.name);

  constructor(
    private readonly depth: DmarketDepthClient,
    private readonly whiteMarket: WhiteMarketPartnerClient,
    private readonly board: PriceBoardService,
    private readonly csfloat: CsfloatClient,
    private readonly steam: SteamMarketClient,
  ) {}

  async search(query: FloatSearchQueryDto): Promise<FloatSearchDto> {
    const { name, floatFrom, floatTo } = query;
    const variant = parseVariantName(name);
    const [dmarket, whiteMarket, csfloat, steam] = await Promise.all([
      this.searchDmarket(variant.marketHashName, floatFrom, floatTo, variant.phase),
      this.searchWhiteMarket(variant.marketHashName, floatFrom, floatTo, variant.phase),
      this.searchCsfloat(variant.marketHashName, floatFrom, floatTo, variant.phase),
      this.searchSteam(variant.marketHashName, floatFrom, floatTo, variant.phase),
    ]);

    const exported = this.board.whiteMarketPrice(name);
    const live = await this.liveWhiteMarketCheapest(variant.marketHashName, variant.phase);
    const item = this.board.find(name);
    const anyFloat = [
      item?.whiteMarket?.listings ? item.whiteMarket.price : null,
      item?.dmarket?.listings ? item.dmarket.price : null,
    ].filter((price): price is number => price !== null);

    return {
      dmarket: dmarket.source,
      whiteMarket,
      csfloat,
      steam,
      whiteMarketCheapest:
        live ??
        (exported
          ? {
              market: MarketId.WhiteMarket,
              price: exported.price,
              float: exported.cheapestFloat,
              paintSeed: null,
              blue: null,
              url: exported.url,
            }
          : null),
      orders: dmarket.orders,
      cheapestAnyFloat: anyFloat.length > 0 ? Math.min(...anyFloat) : null,
    };
  }

  private async liveWhiteMarketCheapest(
    name: string,
    phase: MarketPhase | null,
  ): Promise<FloatListingDto | null> {
    if (!this.whiteMarket.isEnabled) {
      return null;
    }

    try {
      const [cheapest] = await this.whiteMarket.searchListings({ name, phase, limit: 1 });

      return cheapest
        ? {
            market: MarketId.WhiteMarket,
            price: cheapest.price,
            float: cheapest.float === null ? null : Number(cheapest.float),
            paintSeed: cheapest.paintSeed,
            blue: blueShare(name, cheapest.paintSeed),
            url: cheapest.url,
          }
        : null;
    } catch {
      return null;
    }
  }

  private async searchDmarket(
    name: string,
    from?: number,
    to?: number,
    phase?: string | null,
  ): Promise<{ source: FloatSourceDto; orders: FloatBuyOrderDto[] }> {
    try {
      const { offers, orders } = await this.depth.fetch(name);
      const matching = offers
        .filter(
          (offer) =>
            offer.float !== null &&
            inRange(offer.float, from, to) &&
            (!phase || offer.phase === phase),
        )
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
            blue: blueShare(name, offer.paintSeed),
            url: dmarketListingUrl(name, offer.float),
          })),
        },
        orders: liveOrders(offers, orders)
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
    phase?: MarketPhase | null,
  ): Promise<FloatSourceDto> {
    if (!this.whiteMarket.isEnabled) {
      return { status: SourceStatus.NoKeys, ...EMPTY };
    }

    try {
      const listings = await this.whiteMarket.searchListings({
        name,
        floatFrom: from,
        floatTo: to,
        phase,
        limit: LISTINGS_PER_MARKET,
      });
      const mapped: FloatListingDto[] = listings.map((listing) => ({
        market: MarketId.WhiteMarket,
        price: listing.price,
        float: listing.float === null ? null : Number(listing.float),
        paintSeed: listing.paintSeed,
        blue: blueShare(name, listing.paintSeed),
        url: listing.url,
      }));

      return { status: SourceStatus.Ok, listings: mapped, total: mapped.length };
    } catch (error) {
      this.logger.warn(`white.market float search for "${name}" failed: ${String(error)}`);

      return { status: SourceStatus.Error, ...EMPTY };
    }
  }

  private async searchCsfloat(
    name: string,
    from?: number,
    to?: number,
    phase?: MarketPhase | null,
  ): Promise<FloatSourceDto> {
    if (!this.csfloat.isEnabled) {
      return { status: SourceStatus.NoKeys, ...EMPTY };
    }

    try {
      const listings = await this.csfloat.searchListings({
        name,
        floatFrom: from,
        floatTo: to,
        phase,
      });

      return {
        status: SourceStatus.Ok,
        total: listings.length,
        listings: listings.map((listing) => ({
          market: 'csfloat',
          price: listing.price,
          float: listing.float,
          paintSeed: listing.paintSeed,
          blue: blueShare(name, listing.paintSeed),
          url: listing.url,
        })),
      };
    } catch (error) {
      this.logger.warn(`CSFloat listings for "${name}" failed: ${String(error)}`);

      return { status: SourceStatus.Error, ...EMPTY };
    }
  }

  private async searchSteam(
    name: string,
    from?: number,
    to?: number,
    phase?: MarketPhase | null,
  ): Promise<SteamSourceDto> {
    try {
      const listings = await this.steam.searchListings(name, from, to, phase);

      return {
        status: SourceStatus.Ok,
        listings: listings.map((listing) => ({
          ...listing,
          blue: blueShare(name, listing.paintSeed),
        })),
        total: listings.length,
      };
    } catch (error) {
      this.logger.warn(`Steam listings for "${name}" failed: ${String(error)}`);

      return { status: SourceStatus.Error, listings: [], total: 0 };
    }
  }
}

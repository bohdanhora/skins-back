import { Injectable, Logger } from '@nestjs/common';

import {
  CASE_HARDENED_WEAPONS,
  blueShare,
  bluestSeeds,
  caseHardenedWeapon,
  weaponBlueShare,
} from '../../domain/blue-gem';
import { MarketId, dmarketListingUrl } from '../../domain/market-links';
import { CatalogService } from '../catalog/catalog.service';
import { CsfloatClient } from '../csfloat/csfloat.client';
import { DmarketDepthClient } from '../dmarket/dmarket-depth.client';
import { SourceStatus } from '../listings/dto/listings.dto';
import { PriceBoardService } from '../prices/price-board.service';
import { SteamMarketClient } from '../steam/steam-market.client';
import { WhiteMarketPartnerClient } from '../white-market/white-market-partner.client';
import {
  type BlueGemListingDto,
  type BlueGemQueryDto,
  type BlueGemSearchDto,
  type BlueGemWear,
  type CheapestPatternDto,
  type CheapestPatternsDto,
} from './dto/blue-gem.dto';

const CACHE_TTL_MS = 10 * 60_000;
const CHEAPEST_TTL_MS = 5 * 60_000;
const WHITE_MARKET_PAGES = 12;
const CSFLOAT_SEEDS = 10;
const CASE_HARDENED_PAINT_INDEX = 44;

const WEAR_NAMES: Record<BlueGemWear, string> = {
  FN: 'Factory New',
  MW: 'Minimal Wear',
  FT: 'Field-Tested',
  WW: 'Well-Worn',
  BS: 'Battle-Scarred',
};

type RawListing = Omit<BlueGemListingDto, 'blue' | 'floorPrice'>;

interface SourceResult {
  status: SourceStatus;
  listings: BlueGemListingDto[];
}

const hasWear = (name: string, wear: BlueGemWear | undefined): boolean =>
  !wear || name.endsWith(`(${WEAR_NAMES[wear]})`);

const byBlue = (left: BlueGemListingDto, right: BlueGemListingDto): number =>
  right.blue.playside - left.blue.playside ||
  right.blue.backside - left.blue.backside ||
  (left.price ?? Infinity) - (right.price ?? Infinity);

const withBlue = (rows: RawListing[]): BlueGemListingDto[] =>
  rows.flatMap((row) => {
    const weapon = caseHardenedWeapon(row.name);
    const blue = weapon ? weaponBlueShare(weapon, row.paintSeed) : null;

    return blue ? [{ ...row, blue, floorPrice: null }] : [];
  });

@Injectable()
export class BlueGemService {
  private readonly logger = new Logger(BlueGemService.name);
  private readonly cache = new Map<string, { at: number; result: Promise<BlueGemSearchDto> }>();
  private readonly cheapestCache = new Map<
    string,
    { at: number; result: Promise<CheapestPatternsDto> }
  >();

  constructor(
    private readonly board: PriceBoardService,
    private readonly depth: DmarketDepthClient,
    private readonly whiteMarket: WhiteMarketPartnerClient,
    private readonly csfloat: CsfloatClient,
    private readonly steam: SteamMarketClient,
    private readonly catalog: CatalogService,
  ) {}

  weapons(): string[] {
    return [...CASE_HARDENED_WEAPONS];
  }

  search(query: BlueGemQueryDto): Promise<BlueGemSearchDto> {
    const key = `${query.weapon}|${query.wear ?? ''}`;
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.result;
    }

    const result = this.collect(query.weapon, query.wear);

    this.cache.set(key, { at: Date.now(), result });
    result.catch(() => this.cache.delete(key));

    return result;
  }

  private async collect(weapon: string, wear?: BlueGemWear): Promise<BlueGemSearchDto> {
    const names = this.board
      .all()
      .map((item) => item.name)
      .filter((name) => caseHardenedWeapon(name) === weapon && hasWear(name, wear));
    const seeds = bluestSeeds(weapon, CSFLOAT_SEEDS);
    const [dmarket, whiteMarket, csfloat, steam] = await Promise.all([
      this.fromDmarket(names),
      this.fromWhiteMarket(weapon, wear),
      this.fromCsfloat(weapon, wear, seeds),
      wear ? this.fromSteam(names) : Promise.resolve(null),
    ]);

    const listings = [
      ...new Map(
        [dmarket, whiteMarket, csfloat, steam]
          .flatMap((source) => source?.listings ?? [])
          .map((listing) => [`${listing.market}:${listing.id}`, listing] as const),
      ).values(),
    ];
    const floors = this.floorPrices(listings);

    return {
      weapon,
      listings: listings
        .map((listing) => ({ ...listing, floorPrice: floors.get(listing.name) ?? null }))
        .sort(byBlue),
      sources: {
        dmarket: dmarket.status,
        whiteMarket: whiteMarket.status,
        csfloat: csfloat.status,
        steam: steam?.status ?? null,
      },
      csfloatSeeds: seeds.map((seed) => ({ seed, blue: weaponBlueShare(weapon, seed)! })),
      checkedAt: new Date().toISOString(),
    };
  }

  cheapest(name: string): Promise<CheapestPatternsDto> {
    const key = `cheapest|${name}`;
    const cached = this.cheapestCache.get(key);

    if (cached && Date.now() - cached.at < CHEAPEST_TTL_MS) {
      return cached.result;
    }

    const result = this.findCheapest(name);

    this.cheapestCache.set(key, { at: Date.now(), result });
    result.catch(() => this.cheapestCache.delete(key));

    return result;
  }

  private async findCheapest(name: string): Promise<CheapestPatternsDto> {
    if (caseHardenedWeapon(name) === null) {
      return { listings: [] };
    }

    const [whiteMarket, dmarket] = await Promise.all([
      this.whiteMarket.isEnabled
        ? this.whiteMarket
            .searchListings({ name, limit: 1 })
            .then(([listing]) =>
              listing && listing.paintSeed !== null
                ? {
                    market: MarketId.WhiteMarket,
                    price: listing.price,
                    float: listing.float === null ? null : Number(listing.float),
                    paintSeed: listing.paintSeed,
                  }
                : null,
            )
            .catch(() => null)
        : Promise.resolve(null),
      this.depth
        .fetch(name)
        .then(({ offers }) => {
          const offer = offers
            .filter((entry) => entry.paintSeed !== null)
            .sort((left, right) => left.price - right.price)[0];

          return offer
            ? {
                market: MarketId.Dmarket,
                price: offer.price,
                float: offer.float,
                paintSeed: offer.paintSeed!,
              }
            : null;
        })
        .catch(() => null),
    ]);

    return {
      listings: [whiteMarket, dmarket].flatMap((listing): CheapestPatternDto[] => {
        const blue = listing ? blueShare(name, listing.paintSeed) : null;

        return listing && blue ? [{ ...listing, blue }] : [];
      }),
    };
  }

  private floorPrices(listings: BlueGemListingDto[]): Map<string, number> {
    const floors = new Map<string, number>();
    const lower = (name: string, price: number | null | undefined) => {
      if (price === null || price === undefined || price <= 0) return;

      const current = floors.get(name);

      if (current === undefined || price < current) floors.set(name, price);
    };

    for (const name of new Set(listings.map((listing) => listing.name))) {
      const item = this.board.find(name);

      for (const market of Object.values(MarketId)) {
        const quote = item?.[market];

        if (quote && quote.listings > 0) lower(name, quote.price);
      }
    }

    for (const listing of listings) {
      lower(listing.name, listing.price);
    }

    return floors;
  }

  private async fromDmarket(names: string[]): Promise<SourceResult> {
    const results = await Promise.allSettled(
      names.map(async (name): Promise<RawListing[]> => {
        const { offers } = await this.depth.fetch(name);

        return offers.flatMap((offer, index) =>
          offer.paintSeed === null
            ? []
            : [
                {
                  market: MarketId.Dmarket,
                  id: `${name}:${index}`,
                  name,
                  price: offer.price,
                  priceLabel: null,
                  float: offer.float,
                  paintSeed: offer.paintSeed,
                  url: dmarketListingUrl(name, offer.float),
                },
              ],
        );
      }),
    );

    return this.settle('DMarket', results);
  }

  private async fromWhiteMarket(weapon: string, wear?: BlueGemWear): Promise<SourceResult> {
    if (!this.whiteMarket.isEnabled) {
      return { status: SourceStatus.NoKeys, listings: [] };
    }

    try {
      const listings = await this.whiteMarket.searchAllListings(
        `${weapon} | Case Hardened`,
        WHITE_MARKET_PAGES,
      );

      return {
        status: SourceStatus.Ok,
        listings: withBlue(
          listings.flatMap((listing) =>
            listing.paintSeed === null || !hasWear(listing.name, wear)
              ? []
              : [
                  {
                    market: MarketId.WhiteMarket,
                    id: listing.id,
                    name: listing.name,
                    price: listing.price,
                    priceLabel: null,
                    float: listing.float === null ? null : Number(listing.float),
                    paintSeed: listing.paintSeed,
                    url: listing.url,
                  },
                ],
          ),
        ).filter((listing) => caseHardenedWeapon(listing.name) === weapon),
      };
    } catch (error) {
      this.logger.warn(`white.market blue gems for "${weapon}" failed: ${String(error)}`);

      return { status: SourceStatus.Error, listings: [] };
    }
  }

  private async fromCsfloat(
    weapon: string,
    wear: BlueGemWear | undefined,
    seeds: number[],
  ): Promise<SourceResult> {
    const defIndex = this.catalog
      .skins()
      .find((skin) => caseHardenedWeapon(skin.name) === weapon)?.weaponIndex;

    if (!this.csfloat.isEnabled || defIndex === undefined || defIndex === null) {
      return { status: SourceStatus.NoKeys, listings: [] };
    }

    const results = await Promise.allSettled(
      seeds.map(async (paintSeed): Promise<RawListing[]> => {
        const listings = await this.csfloat.searchPatternListings({
          defIndex,
          paintIndex: CASE_HARDENED_PAINT_INDEX,
          paintSeed,
        });

        return listings
          .filter((listing) => hasWear(listing.name, wear))
          .map((listing) => ({
            market: MarketId.Csfloat,
            id: listing.id,
            name: listing.name,
            price: listing.price,
            priceLabel: null,
            float: listing.float,
            paintSeed: listing.paintSeed,
            url: listing.url,
          }));
      }),
    );

    return this.settle('CSFloat', results);
  }

  private async fromSteam(names: string[]): Promise<SourceResult> {
    const results = await Promise.allSettled(
      names.map(async (name): Promise<RawListing[]> => {
        const listings = await this.steam.searchListings(name);

        return listings.flatMap((listing) =>
          listing.paintSeed === null
            ? []
            : [
                {
                  market: 'steam' as const,
                  id: listing.id,
                  name,
                  price: listing.price,
                  priceLabel: listing.priceLabel,
                  float: listing.float,
                  paintSeed: listing.paintSeed,
                  url: listing.url,
                },
              ],
        );
      }),
    );

    return this.settle('Steam', results);
  }

  private settle(market: string, results: PromiseSettledResult<RawListing[]>[]): SourceResult {
    const failed = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );

    if (failed.length > 0) {
      this.logger.warn(
        `${market} blue gems: ${failed.length} of ${results.length} requests failed: ${String(failed[0].reason)}`,
      );
    }

    return {
      status:
        results.length > 0 && failed.length === results.length
          ? SourceStatus.Error
          : SourceStatus.Ok,
      listings: withBlue(
        results.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])),
      ),
    };
  }
}

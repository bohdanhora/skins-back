import { Injectable } from '@nestjs/common';

import { MarketId } from '../../domain/market-links';
import { parseVariantName } from '../../domain/market-variant';
import {
  TradeUpTier,
  tradeUpMarketName,
  tradeUpTier,
  wearsInRange,
  type WearCode,
} from '../../domain/trade-up';
import { CatalogService, type SkinDefinition } from '../catalog/catalog.service';
import { PriceBoardService } from '../prices/price-board.service';
import { type TradeUpCatalogDto, type TradeUpSkinDto } from './dto/trade-ups.dto';

const MARKETS = Object.values(MarketId);
const ANY_WEAR = 'ANY';
const STATTRAK = 'ST:';

type Quote = [number, number];

@Injectable()
export class TradeUpsService {
  private cached: { key: string; value: TradeUpCatalogDto } | null = null;

  constructor(
    private readonly catalog: CatalogService,
    private readonly board: PriceBoardService,
  ) {}

  catalogue(): TradeUpCatalogDto {
    const key = `${this.catalog.version}:${this.board.version}`;

    if (this.cached?.key === key) return this.cached.value;

    const quotes = this.quotes();
    const skins = this.catalog.skins();
    const rareCases = new Set(
      skins
        .filter((skin) => tradeUpTier(skin.name, skin.rarity) === TradeUpTier.Rare)
        .flatMap((skin) => skin.crates),
    );
    const value: TradeUpCatalogDto = {
      skins: skins.flatMap((skin) => {
        const entry = this.toSkin(skin, quotes, rareCases);

        return entry ? [entry] : [];
      }),
      updatedAt: this.board.state.dmarket.updatedAt,
    };

    this.cached = { key, value };

    return value;
  }

  private toSkin(
    skin: SkinDefinition,
    quotes: Map<string, Quote>,
    rareCases: Set<string>,
  ): TradeUpSkinDto | null {
    const tier = tradeUpTier(skin.name, skin.rarity);

    if (!tier || (tier !== TradeUpTier.Rare && skin.collections.length === 0)) {
      return null;
    }

    const prices: Record<string, Quote> = {};
    const wears: (WearCode | null)[] = skin.wearless
      ? [null]
      : wearsInRange(skin.minFloat, skin.maxFloat);

    for (const statTrak of skin.stattrak ? [false, true] : [false]) {
      for (const wear of wears) {
        const quote = quotes.get(tradeUpMarketName(skin.name, wear, statTrak));

        if (quote) prices[`${statTrak ? STATTRAK : ''}${wear ?? ANY_WEAR}`] = quote;
      }
    }

    return {
      name: skin.name,
      weapon: skin.weapon,
      tier,
      collections: skin.collections,
      cases:
        tier === TradeUpTier.Covert || tier === TradeUpTier.Rare
          ? skin.crates.filter((crate) => rareCases.has(crate))
          : [],
      minFloat: skin.minFloat,
      maxFloat: skin.maxFloat,
      wearless: skin.wearless,
      stattrak: skin.stattrak,
      image: skin.image,
      prices,
    };
  }

  private quotes(): Map<string, Quote> {
    const quotes = new Map<string, Quote>();

    for (const item of this.board.all()) {
      let price = Infinity;
      let listings = 0;

      for (const market of MARKETS) {
        const quote = item[market];

        if (!quote || quote.listings <= 0 || quote.price === null || quote.price <= 0) continue;

        price = Math.min(price, quote.price);
        listings += quote.listings;
      }

      if (!Number.isFinite(price)) continue;

      const name = parseVariantName(item.name).marketHashName;
      const current = quotes.get(name);

      quotes.set(
        name,
        current ? [Math.min(current[0], price), current[1] + listings] : [price, listings],
      );
    }

    return quotes;
  }
}

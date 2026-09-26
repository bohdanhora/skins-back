import { Injectable } from '@nestjs/common';

import { blueShare } from '../../domain/blue-gem';
import { sumValues, valueItem } from '../../domain/inventory-value';
import { variantName } from '../../domain/market-variant';
import { feesFrom } from '../items/item-query';
import { ItemIndexService } from '../items/item-index.service';
import { SalesHistoryService } from '../prices/sales-history.service';
import {
  SteamInventoryClient,
  type SteamInventoryItem,
  type SteamProfile,
} from '../steam/steam-inventory.client';
import {
  type InventoryDto,
  type InventoryItemDto,
  type InventoryQueryDto,
} from './dto/inventory.dto';

const INVENTORY_TTL_MS = 10 * 60_000;
const PROFILE_TTL_MS = 24 * 60 * 60_000;
const PERCENT = 100;

interface CachedInventory {
  items: SteamInventoryItem[];
  fetchedAt: number;
}

const groupKey = (item: SteamInventoryItem): string =>
  item.float === null && item.paintSeed === null
    ? `${item.marketHashName}|${String(item.tradable)}`
    : item.assetId;

const totalAmount = (items: InventoryItemDto[]): number =>
  items.reduce((sum, item) => sum + item.amount, 0);

@Injectable()
export class InventoryService {
  private readonly profiles = new Map<string, { profile: SteamProfile; at: number }>();
  private readonly inventories = new Map<string, CachedInventory>();
  private readonly pending = new Map<string, Promise<CachedInventory>>();

  constructor(
    private readonly steam: SteamInventoryClient,
    private readonly index: ItemIndexService,
    private readonly sales: SalesHistoryService,
  ) {}

  async get(query: InventoryQueryDto): Promise<InventoryDto> {
    const profile = await this.profile(query.profile);
    const inventory = await this.inventory(profile.steamId, query.refresh);
    const fees = feesFrom(query);
    const withdrawals = {
      whiteMarket: query.withdrawWhiteMarket / PERCENT,
      dmarket: query.withdrawDmarket / PERCENT,
      csfloat: query.withdrawCsfloat / PERCENT,
    };
    const groups = new Map<string, SteamInventoryItem[]>();

    for (const item of inventory.items) {
      const key = groupKey(item);

      groups.set(key, [...(groups.get(key) ?? []), item]);
    }

    const items: InventoryItemDto[] = [...groups.values()].map((group) => {
      const [first] = group;
      const name = first.phase
        ? variantName(first.marketHashName, first.phase)
        : first.marketHashName;
      const indexed = this.index.find(name) ?? this.index.find(first.marketHashName);
      const quotes = {
        whiteMarket: indexed?.whiteMarket ?? null,
        dmarket: indexed?.dmarket ?? null,
        csfloat: indexed?.csfloat ?? null,
      };
      const value = first.marketable
        ? valueItem(quotes, fees, withdrawals)
        : { options: [], best: null, marketPrice: null };

      return {
        assetIds: group.map((entry) => entry.assetId),
        name,
        marketHashName: first.marketHashName,
        type: first.type,
        image: indexed?.image ?? first.image,
        rarityColor: indexed?.rarityColor ?? first.nameColor,
        float: first.float,
        paintSeed: first.paintSeed,
        blue: blueShare(first.marketHashName, first.paintSeed),
        phase: first.phase,
        amount: group.reduce((sum, entry) => sum + entry.amount, 0),
        tradable: first.tradable,
        marketable: first.marketable,
        ...quotes,
        ...value,
        sales: this.sales.get(name),
      };
    });

    items.sort(
      (left, right) =>
        (right.best?.payout ?? -1) * right.amount - (left.best?.payout ?? -1) * left.amount,
    );

    const priced = items.filter((item) => item.best !== null);

    return {
      steamId: profile.steamId,
      name: profile.name,
      avatar: profile.avatar,
      fetchedAt: new Date(inventory.fetchedAt).toISOString(),
      totals: {
        ...sumValues(priced.map((item) => ({ value: item, amount: item.amount }))),
        items: totalAmount(items),
        pricedItems: totalAmount(priced),
        unsellableItems: totalAmount(items.filter((item) => !item.marketable)),
      },
      items,
    };
  }

  private async profile(input: string): Promise<SteamProfile> {
    const key = input.trim().toLowerCase();
    const cached = this.profiles.get(key);

    if (cached && Date.now() - cached.at < PROFILE_TTL_MS) {
      return cached.profile;
    }

    const profile = await this.steam.resolveProfile(input);

    this.profiles.set(key, { profile, at: Date.now() });

    return profile;
  }

  private inventory(steamId: string, refresh: boolean): Promise<CachedInventory> {
    const cached = this.inventories.get(steamId);

    if (cached && !refresh && Date.now() - cached.fetchedAt < INVENTORY_TTL_MS) {
      return Promise.resolve(cached);
    }

    const running = this.pending.get(steamId);

    if (running) {
      return running;
    }

    const request = this.steam
      .fetchInventory(steamId)
      .then((items) => {
        const fresh = { items, fetchedAt: Date.now() };

        this.inventories.set(steamId, fresh);

        return fresh;
      })
      .catch((error: unknown) => {
        if (cached) {
          return cached;
        }

        throw error;
      })
      .finally(() => this.pending.delete(steamId));

    this.pending.set(steamId, request);

    return request;
  }
}

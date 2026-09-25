import {
  findInstantFlip,
  findListingFlip,
  findPriceGap,
  type Fees,
  type MarketQuote,
} from '../../domain/comparison';
import { findTopOffer, type SalesStats } from '../../domain/sales';
import { type ItemViewDto } from './dto/item-view.dto';
import { DealMode, ItemSort, type ItemsQueryDto } from './dto/items-query.dto';
import { type IndexedItem } from './item-index.service';

const PERCENT = 100;

export const feesFrom = (query: Pick<ItemsQueryDto, 'feeWhiteMarket' | 'feeDmarket'>): Fees => ({
  whiteMarket: query.feeWhiteMarket / PERCENT,
  dmarket: query.feeDmarket / PERCENT,
});

export type SalesLookup = (name: string) => SalesStats | null;

export const toView = (item: IndexedItem, fees: Fees, sales: SalesStats | null): ItemViewDto => ({
  name: item.name,
  image: item.image,
  rarity: item.rarity,
  rarityColor: item.rarityColor,
  category: item.category,
  whiteMarket: item.whiteMarket,
  dmarket: item.dmarket,
  gap: findPriceGap(item.whiteMarket, item.dmarket),
  flip: findListingFlip(item.whiteMarket, item.dmarket, fees),
  instant: findInstantFlip(item.whiteMarket, item.dmarket, fees),
  sales,
  top: findTopOffer(cheapestListing(item), item.dmarket?.bid ?? null, sales, secondListing(item)),
});

const listedPrice = (quote: MarketQuote | null): number | null =>
  quote && quote.listings > 0 ? quote.price : null;

/** The lowest listing on the market that is not the cheapest, when both sell the item. */
const secondListing = (item: Pick<ItemViewDto, 'whiteMarket' | 'dmarket'>): number | null => {
  const wm = listedPrice(item.whiteMarket);
  const dm = listedPrice(item.dmarket);

  return wm !== null && dm !== null ? Math.max(wm, dm) : null;
};

/** What you would pay today: the cheapest listing on either market. */
const cheapestListing = (item: Pick<ItemViewDto, 'whiteMarket' | 'dmarket'>): number | null => {
  const prices = [listedPrice(item.whiteMarket), listedPrice(item.dmarket)].filter(
    (price): price is number => price !== null,
  );

  return prices.length > 0 ? Math.min(...prices) : null;
};

const popularity = (view: ItemViewDto): number =>
  (view.whiteMarket?.listings ?? 0) + (view.dmarket?.listings ?? 0);

/** Supply on the thinner side of the comparison, so one lonely listing does not look like a deal. */
const depth = (view: ItemViewDto, mode: DealMode): number => {
  const wm = view.whiteMarket?.listings ?? 0;
  const dm = view.dmarket?.listings ?? 0;

  switch (mode) {
    case DealMode.All:
    case DealMode.Top:
      return Math.max(wm, dm);
    case DealMode.Instant:
      return Math.min(wm, view.dmarket?.bids ?? 0);
    default:
      return Math.min(wm, dm);
  }
};

const benefit = (view: ItemViewDto, mode: DealMode): { percent: number; amount: number } | null => {
  switch (mode) {
    case DealMode.Gap:
      return view.gap;
    case DealMode.Flip:
      return view.flip && { percent: view.flip.percent, amount: view.flip.profit };
    case DealMode.Instant:
      return view.instant && { percent: view.instant.percent, amount: view.instant.profit };
    case DealMode.Top:
      return view.top && { percent: view.top.percent, amount: view.top.discount };
    default:
      return view.gap;
  }
};

const matchesWords = (item: IndexedItem, words: string[]): boolean =>
  words.every((word) => item.searchName.includes(word));

const defaultSort = (query: ItemsQueryDto): ItemSort => {
  if (query.mode !== DealMode.All) {
    return ItemSort.Benefit;
  }

  return ItemSort.Popular;
};

const comparator = (
  sort: ItemSort,
  mode: DealMode,
): ((left: ItemViewDto, right: ItemViewDto) => number) => {
  const byNullableNumber =
    (read: (view: ItemViewDto) => number | null | undefined, direction: 1 | -1) =>
    (left: ItemViewDto, right: ItemViewDto): number => {
      const a = read(left);
      const b = read(right);

      if (a == null || b == null) {
        return a == null ? (b == null ? 0 : 1) : -1;
      }

      return (a - b) * direction;
    };

  switch (sort) {
    case ItemSort.Benefit:
      return byNullableNumber((view) => benefit(view, mode)?.percent, -1);
    case ItemSort.BenefitAmount:
      return byNullableNumber((view) => benefit(view, mode)?.amount, -1);
    case ItemSort.BidCover:
      return byNullableNumber((view) => view.top?.bidCover ?? view.dmarket?.bid, -1);
    case ItemSort.PriceAsc:
      return byNullableNumber(cheapestListing, 1);
    case ItemSort.PriceDesc:
      return byNullableNumber(cheapestListing, -1);
    case ItemSort.Name:
      return (left, right) => left.name.localeCompare(right.name);
    default:
      return (left, right) => popularity(right) - popularity(left);
  }
};

export interface ItemsPage {
  items: ItemViewDto[];
  total: number;
}

export const queryItems = (
  rows: readonly IndexedItem[],
  query: ItemsQueryDto,
  salesOf: SalesLookup,
): ItemsPage => {
  const fees = feesFrom(query);
  const words = (query.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const names = query.names ? new Set(query.names) : null;
  const minPrice = query.minPrice !== undefined ? Math.round(query.minPrice * 100) : null;
  const maxPrice = query.maxPrice !== undefined ? Math.round(query.maxPrice * 100) : null;
  const matches: ItemViewDto[] = [];

  for (const row of rows) {
    if (names && !names.has(row.name)) {
      continue;
    }

    if ((query.category && row.category !== query.category) || !matchesWords(row, words)) {
      continue;
    }

    const view = toView(row, fees, salesOf(row.name));
    const price = cheapestListing(view);

    if (
      (minPrice !== null && (price === null || price < minPrice)) ||
      (maxPrice !== null && (price === null || price > maxPrice))
    ) {
      continue;
    }

    if (depth(view, query.mode) < query.minListings) {
      continue;
    }

    if (
      (query.minWeekSales > 0 && (view.sales?.weekSales ?? 0) < query.minWeekSales) ||
      (query.minBidCover > 0 && (view.top?.bidCover ?? 0) < query.minBidCover)
    ) {
      continue;
    }

    if (query.mode !== DealMode.All) {
      const gain = benefit(view, query.mode);

      if (!gain || (query.onlyProfitable && gain.amount <= 0)) {
        continue;
      }
    }

    matches.push(view);
  }

  matches.sort(comparator(query.sort ?? defaultSort(query), query.mode));

  return {
    items: matches.slice(query.offset, query.offset + query.limit),
    total: matches.length,
  };
};

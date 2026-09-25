import { ItemCategory } from '../../domain/categories';
import { MarketId } from '../../domain/market-links';
import { type SalesStats } from '../../domain/sales';
import { DealMode, ItemEdition, ItemSort, ItemWear, ItemsQueryDto } from './dto/items-query.dto';
import { queryItems } from './item-query';
import { type IndexedItem } from './item-index.service';

const quote = (price: number) => ({ price, listings: 10, bid: price - 5, bids: 2, url: '' });

const item = (partial: Partial<IndexedItem> & Pick<IndexedItem, 'name'>): IndexedItem => {
  const { name, ...overrides } = partial;

  return {
    name,
    searchName: name.toLowerCase(),
    image: null,
    rarity: null,
    rarityColor: null,
    category: ItemCategory.Knife,
    phase: null,
    collections: [],
    whiteMarket: quote(100),
    dmarket: quote(200),
    csfloat: null,
    ...overrides,
  };
};

const sales = (eightWeekSales: number): SalesStats => ({
  floor: 300,
  lastDay: '2026-09-25',
  lastAverage: 250,
  weekSales: 5,
  eightWeekSales,
  eightWeekAverage: 240,
  trendPercent: 2,
});

describe('item filters', () => {
  it('combines phase, wear, edition, collection and cheapest market', () => {
    const sapphire = item({
      name: '★ StatTrak™ Karambit | Doppler (Minimal Wear) [Sapphire]',
      phase: 'sapphire',
      collections: [{ name: 'Rare Knives', image: null }],
    });
    const ordinary = item({
      name: '★ Karambit | Doppler (Factory New)',
      whiteMarket: quote(200),
      dmarket: quote(100),
    });
    const query = Object.assign(new ItemsQueryDto(), {
      wear: ItemWear.MinimalWear,
      edition: ItemEdition.StatTrak,
      phase: 'sapphire' as const,
      collection: 'Rare Knives',
      cheapestOn: MarketId.WhiteMarket,
    });

    const result = queryItems([ordinary, sapphire], query, () => sales(50));

    expect(result.total).toBe(1);
    expect(result.items[0]?.name).toBe(sapphire.name);
  });

  it('filters and sorts by eight-week sales', () => {
    const active = item({ name: 'AK-47 | Redline (Field-Tested)' });
    const quiet = item({ name: 'AWP | Asiimov (Field-Tested)' });
    const stats = new Map([
      [active.name, sales(80)],
      [quiet.name, sales(8)],
    ]);
    const query = Object.assign(new ItemsQueryDto(), {
      mode: DealMode.All,
      sort: ItemSort.Sales8w,
      minEightWeekSales: 10,
    });

    const result = queryItems([quiet, active], query, (name) => stats.get(name) ?? null);

    expect(result.items.map((entry) => entry.name)).toEqual([active.name]);
  });
});

import { MarketId } from './market-links';
import { findTopOffer, floorFromSales, summarizeSales, type DailySales } from './sales';

const NOW = Date.parse('2026-09-25T12:00:00Z');

const day = (offset: number, average: number, count = 5): DailySales => ({
  day: new Date(NOW - offset * 86_400_000).toISOString().slice(0, 10),
  average,
  count,
});

describe('summarizeSales', () => {
  it('uses the lower quartile of recent daily averages as the floor', () => {
    const stats = summarizeSales(
      [day(0, 7000), day(1, 7700), day(2, 8000), day(3, 9000), day(4, 25000)],
      NOW,
    );

    expect(stats).toMatchObject({
      floor: 7700,
      lastDay: day(0, 0).day,
      lastAverage: 7000,
      weekSales: 25,
    });
  });

  it('ignores days older than two weeks for the floor and a week for the count', () => {
    const stats = summarizeSales(
      [day(20, 100), day(21, 100), day(1, 5000), day(2, 5000), day(9, 5000, 2)],
      NOW,
    );

    expect(stats?.floor).toBe(5000);
    expect(stats?.weekSales).toBe(10);
  });

  it('needs a few days with sales', () => {
    expect(summarizeSales([day(0, 5000), day(1, 5000, 0), day(2, 5000)], NOW)).toBeNull();
  });
});

describe('floorFromSales', () => {
  const sale = (price: number, daysAgo = 1) => ({ price, at: NOW - daysAgo * 86_400_000 });

  it('takes the lower quartile of single sales in the last month', () => {
    expect(
      floorFromSales(
        [sale(12000), sale(12500), sale(13000), sale(14000), sale(20000), sale(1000, 40)],
        NOW,
      ),
    ).toEqual({ floor: 12500, sales: 5 });
  });

  it('needs a few recent sales', () => {
    expect(floorFromSales([sale(12000), sale(12500), sale(13000), sale(14000)], NOW)).toBeNull();
  });
});

describe('findTopOffer', () => {
  const floors = {
    csfloat: { floor: 12500, sales: 40 },
    dmarket: { floor: 14300, sales: 500 },
  };

  it('judges each market by its own sales', () => {
    expect(
      findTopOffer(
        [
          [MarketId.Csfloat, 12063],
          [MarketId.Dmarket, 13086],
        ],
        floors,
        null,
      ),
    ).toEqual({
      market: MarketId.Csfloat,
      price: 12063,
      reference: 12500,
      discount: 437,
      percent: 3.5,
      bidCover: null,
    });
  });

  it('is not an offer when a market is at its usual price', () => {
    expect(
      findTopOffer([[MarketId.Csfloat, 12600]], { csfloat: { floor: 12500, sales: 40 } }, null),
    ).toBeNull();
  });

  it('never counts a discount past a cheaper listing elsewhere', () => {
    expect(
      findTopOffer(
        [
          [MarketId.Dmarket, 13000],
          [MarketId.Csfloat, 13200],
        ],
        { dmarket: { floor: 15000, sales: 100 } },
        null,
      ),
    ).toMatchObject({ market: MarketId.Dmarket, reference: 13200, discount: 200 });
  });

  it('skips markets without their own history', () => {
    expect(findTopOffer([[MarketId.LisSkins, 10000]], floors, null)).toBeNull();
    expect(findTopOffer([[MarketId.WhiteMarket, 10000]], floors, null)).toBeNull();
  });

  it('measures the buy order after the DMarket fee', () => {
    expect(findTopOffer([[MarketId.Csfloat, 12000]], floors, 12400, 0.05)?.bidCover).toBe(98.2);
  });
});

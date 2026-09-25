import { findTopOffer, summarizeSales, type DailySales } from './sales';

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

    expect(stats).toEqual({
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

describe('findTopOffer', () => {
  const stats = { floor: 77000, lastDay: '2026-09-25', lastAverage: 77000, weekSales: 12 };

  it('measures the discount below the sales floor and how close the buy orders are', () => {
    expect(findTopOffer(65000, 64000, stats)).toEqual({
      price: 65000,
      reference: 77000,
      discount: 12000,
      percent: 15.58,
      bidCover: 98.5,
    });
  });

  it('is not an offer at or above the floor', () => {
    expect(findTopOffer(77000, 76000, stats)).toBeNull();
    expect(findTopOffer(65000, null, null)).toBeNull();
  });

  it('never counts a discount past the next cheapest listing', () => {
    expect(findTopOffer(65000, null, stats, 70000)).toMatchObject({
      reference: 70000,
      discount: 5000,
    });
    expect(findTopOffer(65000, null, stats, 65000)).toBeNull();
  });

  it('works without buy orders', () => {
    expect(findTopOffer(65000, null, stats)?.bidCover).toBeNull();
  });
});

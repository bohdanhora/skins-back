import { calculateDealScore } from './deal-score';

describe('deal score', () => {
  it('rewards a real discount, liquid sales and a close buy order', () => {
    const strong = calculateDealScore(
      { price: 100, reference: 130, discount: 30, percent: 23, bidCover: 96 },
      {
        floor: 130,
        lastDay: '2026-09-25',
        lastAverage: 130,
        weekSales: 12,
        eightWeekSales: 90,
        eightWeekAverage: 128,
        trendPercent: 2,
      },
      15,
    );
    const weak = calculateDealScore(
      { price: 100, reference: 105, discount: 5, percent: 4.8, bidCover: 50 },
      { floor: 105, lastDay: '2026-09-25', lastAverage: 105, weekSales: 1 },
      1,
    );

    expect(strong?.confidence).toBe('high');
    expect(strong!.score).toBeGreaterThan(weak!.score);
  });
});

describe('deal score money weight', () => {
  const sales = {
    floor: 0,
    lastDay: '2026-09-25',
    lastAverage: 0,
    weekSales: 20,
    eightWeekSales: 150,
    trendPercent: 0,
  };

  it('ranks a big discount in dollars above the same percent on a cheap item', () => {
    const cheap = calculateDealScore(
      { price: 70, reference: 95, discount: 25, percent: 26, bidCover: 100 },
      sales,
      200,
    );
    const pricey = calculateDealScore(
      { price: 7_400, reference: 10_000, discount: 2_600, percent: 26, bidCover: 100 },
      sales,
      200,
    );

    expect(pricey!.score).toBeGreaterThan(cheap!.score);
  });

  it('does not reward a buy order above the price', () => {
    const top = { price: 100, reference: 130, discount: 30, percent: 23 };

    expect(calculateDealScore({ ...top, bidCover: 260 }, sales, 10)).toEqual(
      calculateDealScore({ ...top, bidCover: 100 }, sales, 10),
    );
  });
});

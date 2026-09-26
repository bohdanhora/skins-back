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

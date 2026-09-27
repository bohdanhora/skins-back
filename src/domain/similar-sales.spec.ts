import { median, similarFloatSales } from './similar-sales';

describe('similarFloatSales', () => {
  it('widens the float window until there are enough sales', () => {
    const sales = [
      { price: 100, float: 0.255 },
      { price: 110, float: 0.26 },
      { price: 120, float: 0.28 },
      { price: 130, float: 0.29 },
      { price: 140, float: 0.24 },
      { price: 500, float: 0.05 },
      { price: 90, float: null },
    ];

    expect(similarFloatSales(sales, 0.257)).toEqual({
      count: 5,
      median: 120,
      low: 100,
      high: 140,
      floatRange: [0.217, 0.297],
    });
  });

  it('returns null without sales near the float', () => {
    expect(similarFloatSales([{ price: 100, float: 0.9 }], 0.1)).toBeNull();
  });

  it('takes the middle of an even list', () => {
    expect(median([4, 1, 3, 2])).toBe(3);
  });
});

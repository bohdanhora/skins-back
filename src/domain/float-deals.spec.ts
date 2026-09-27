import { findFloatDeals, type FloatLot } from './float-deals';

const lot = (float: number, price: number): FloatLot => ({
  market: 'dmarket',
  price,
  float,
  url: `https://x/${float}`,
});

describe('float deals', () => {
  it('finds a low float cheaper than every nearby worse float', () => {
    const lots = [
      lot(0.071, 1_500),
      lot(0.072, 2_200),
      lot(0.075, 2_100),
      lot(0.08, 2_000),
      lot(0.09, 1_900),
    ];
    const [deal] = findFloatDeals(lots, [], 5, 5);

    expect(deal.float).toBe(0.071);
    expect(deal.worseCheapest).toBe(1_900);
    expect(deal.saving).toBe(400);
  });

  it('ignores savings too small to matter', () => {
    const lots = [lot(0.07, 1_990), lot(0.08, 2_000), lot(0.09, 2_010), lot(0.1, 2_020)];

    expect(findFloatDeals(lots, [], 5, 5)).toEqual([]);
  });

  it('needs a few worse floats to compare against', () => {
    expect(findFloatDeals([lot(0.07, 1_000), lot(0.08, 2_000)], [], 5, 5)).toEqual([]);
  });

  it('counts a buy order that already pays more after the fee', () => {
    const [deal] = findFloatDeals(
      [lot(0.071, 1_000)],
      [{ price: 1_200, range: [0.07, 0.08] }],
      5,
      5,
    );

    expect(deal.orderPrice).toBe(1_200);
    expect(deal.orderProfit).toBe(140);
    expect(deal.score).toBe(140);
  });

  it('ignores orders that do not cover the float', () => {
    expect(
      findFloatDeals([lot(0.09, 1_000)], [{ price: 5_000, range: [0.07, 0.08] }], 5, 5),
    ).toEqual([]);
  });

  it('keeps the best few', () => {
    const lots = Array.from({ length: 12 }, (_, index) =>
      lot(0.07 + index / 1000, 1_000 + index * 100),
    );

    expect(findFloatDeals(lots, [], 5, 3)).toHaveLength(3);
  });
});

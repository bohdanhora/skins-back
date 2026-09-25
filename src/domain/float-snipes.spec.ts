import {
  findSnipes,
  orderAccepts,
  snipeProfit,
  type SnipeCandidate,
  type DepthOrder,
} from './float-snipes';

const offer = (
  price: number,
  float: number | null,
  extra: Partial<SnipeCandidate> = {},
): SnipeCandidate => ({
  source: 'dmarket',
  price,
  float,
  paintSeed: 100,
  phase: null,
  ...extra,
});

const order = (price: number, extra: Partial<DepthOrder> = {}): DepthOrder => ({
  price,
  amount: 1,
  floatPart: null,
  paintSeed: null,
  phase: null,
  ...extra,
});

describe('orderAccepts', () => {
  it('checks the float bucket, pattern and phase the order asks for', () => {
    expect(orderAccepts(order(1, { floatPart: 'FT-0' }), offer(1, 0.16))).toBe(true);
    expect(orderAccepts(order(1, { floatPart: 'FT-0' }), offer(1, 0.19))).toBe(false);
    expect(orderAccepts(order(1, { paintSeed: 661 }), offer(1, 0.2, { paintSeed: 661 }))).toBe(
      true,
    );
    expect(orderAccepts(order(1, { paintSeed: 661 }), offer(1, 0.2))).toBe(false);
    expect(orderAccepts(order(1, { phase: 'ruby' }), offer(1, 0.01, { phase: 'ruby' }))).toBe(true);
    expect(orderAccepts(order(1, { phase: 'ruby' }), offer(1, 0.01, { phase: 'phase-2' }))).toBe(
      false,
    );
  });

  it('never matches a float condition when the float is unknown', () => {
    expect(orderAccepts(order(1, { floatPart: 'FT-0' }), offer(1, null))).toBe(false);
  });
});

describe('findSnipes', () => {
  it('finds a low float listed at the normal price while its bucket pays double', () => {
    const snipes = findSnipes(
      [offer(2700, 0.1587), offer(2700, 0.3), offer(5700, 0.16)],
      [order(5400, { floatPart: 'FT-0', amount: 4 }), order(2666)],
    );

    expect(snipes).toHaveLength(1);
    expect(snipes[0]).toMatchObject({
      listingPrice: 2700,
      float: 0.1587,
      orderPrice: 5400,
      orderAmount: 4,
      orderFloatPart: 'FT-0',
    });
  });

  it('picks the best paying order for each listing and the biggest gaps first', () => {
    const snipes = findSnipes(
      [offer(1000, 0.16), offer(2000, 0.16)],
      [order(1500, { floatPart: 'FT-0' }), order(3000, { floatPart: 'FT-0', amount: 2 })],
    );

    expect(snipes.map((snipe) => [snipe.listingPrice, snipe.orderPrice])).toEqual([
      [1000, 3000],
      [2000, 3000],
    ]);
  });

  it('never promises one order to more listings than it wants', () => {
    const snipes = findSnipes(
      [offer(1600, 0.19), offer(1597, 0.2), offer(1599, 0.2)],
      [
        order(4687, { floatPart: 'FT-1', amount: 1 }),
        order(3000, { floatPart: 'FT-1', amount: 1 }),
      ],
    );

    expect(snipes.map((snipe) => [snipe.listingPrice, snipe.orderPrice])).toEqual([
      [1597, 4687],
      [1599, 3000],
    ]);
  });

  it('lets a white.market listing compete for the same orders', () => {
    const snipes = findSnipes(
      [offer(1500, 0.19, { source: 'whiteMarket', paintSeed: null }), offer(1600, 0.19)],
      [order(4687, { floatPart: 'FT-1' })],
    );

    expect(snipes).toHaveLength(1);
    expect(snipes[0].source).toBe('whiteMarket');
  });

  it('counts the DMarket seller fee in the profit', () => {
    const [snipe] = findSnipes([offer(2700, 0.16)], [order(5400, { floatPart: 'FT-0' })]);

    expect(snipeProfit(snipe, 0.05)).toBe(5130 - 2700);
  });
});

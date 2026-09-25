import { findInstantFlip, findListingFlip, findPriceGap, type MarketQuote } from './comparison';
import { MarketId } from './market-links';

const quote = (price: number | null, extra: Partial<MarketQuote> = {}): MarketQuote => ({
  price,
  listings: price === null ? 0 : 5,
  bid: null,
  bids: 0,
  url: '',
  ...extra,
});

const fees = { whiteMarket: 0.05, dmarket: 0.05 };

describe('findPriceGap', () => {
  it('points at the cheaper market and measures the gap against the higher price', () => {
    expect(findPriceGap(quote(800), quote(1000))).toEqual({
      cheaper: MarketId.WhiteMarket,
      amount: 200,
      percent: 20,
    });
  });

  it('ignores items missing on either side or priced the same', () => {
    expect(findPriceGap(quote(null), quote(1000))).toBeNull();
    expect(findPriceGap(quote(1000), null)).toBeNull();
    expect(findPriceGap(quote(500), quote(500))).toBeNull();
  });

  it('treats a price with zero listings as missing', () => {
    expect(findPriceGap(quote(100, { listings: 0 }), quote(1000))).toBeNull();
  });
});

describe('findListingFlip', () => {
  it('lists one cent under the other market and pays its seller fee', () => {
    const flip = findListingFlip(quote(1000), quote(1300), fees);

    expect(flip).toMatchObject({
      buyOn: MarketId.WhiteMarket,
      sellOn: MarketId.Dmarket,
      buyPrice: 1000,
      sellPrice: 1299,
      profit: 1234 - 1000,
    });
  });

  it('reports a loss when fees eat the gap', () => {
    expect(findListingFlip(quote(1000), quote(1020), fees)!.profit).toBeLessThan(0);
  });
});

describe('findInstantFlip', () => {
  it('sells into the DMarket buy order right away', () => {
    const flip = findInstantFlip(quote(1000), quote(1500, { bid: 1200, bids: 3 }), fees);

    expect(flip).toMatchObject({ buyPrice: 1000, sellPrice: 1200, profit: 140, percent: 14 });
  });

  it('needs a live buy order', () => {
    expect(findInstantFlip(quote(1000), quote(1500), fees)).toBeNull();
  });
});

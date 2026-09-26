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

const fees = { whiteMarket: 0.05, dmarket: 0.05, csfloat: 0.02 };

const quotes = (
  whiteMarket: MarketQuote | null,
  dmarket: MarketQuote | null,
  csfloat: MarketQuote | null = null,
  lisSkins: MarketQuote | null = null,
) => ({ whiteMarket, dmarket, csfloat, lisSkins });

describe('findPriceGap', () => {
  it('points at the cheaper market and measures the gap against the higher price', () => {
    expect(findPriceGap(quotes(quote(800), quote(1000)))).toEqual({
      cheaper: MarketId.WhiteMarket,
      amount: 200,
      percent: 20,
    });
  });

  it('ignores items missing on either side or priced the same', () => {
    expect(findPriceGap(quotes(quote(null), quote(1000)))).toBeNull();
    expect(findPriceGap(quotes(quote(1000), null))).toBeNull();
    expect(findPriceGap(quotes(quote(500), quote(500)))).toBeNull();
  });

  it('measures the gap against the next cheapest market, not the priciest one', () => {
    expect(findPriceGap(quotes(quote(800), quote(1000), quote(98_000)))).toEqual({
      cheaper: MarketId.WhiteMarket,
      amount: 200,
      percent: 20,
    });
  });

  it('treats a price with zero listings as missing', () => {
    expect(findPriceGap(quotes(quote(100, { listings: 0 }), quote(1000)))).toBeNull();
  });
});

describe('findListingFlip', () => {
  it('lists one cent under the other market and pays its seller fee', () => {
    const flip = findListingFlip(quotes(quote(1000), quote(1300), null), fees);

    expect(flip).toMatchObject({
      buyOn: MarketId.WhiteMarket,
      sellOn: MarketId.Dmarket,
      buyPrice: 1000,
      sellPrice: 1299,
      profit: 1234 - 1000,
    });
  });

  it('reports a loss when fees eat the gap', () => {
    expect(findListingFlip(quotes(quote(1000), quote(1020), null), fees)!.profit).toBeLessThan(0);
  });

  it('compares CSFloat with the other markets', () => {
    expect(findListingFlip(quotes(quote(1300), quote(1200), quote(900)), fees)).toMatchObject({
      buyOn: MarketId.Csfloat,
      sellOn: MarketId.WhiteMarket,
      buyPrice: 900,
    });
  });
});

describe('findInstantFlip', () => {
  it('sells into the DMarket buy order right away', () => {
    const flip = findInstantFlip(quotes(quote(1000), quote(1500, { bid: 1200, bids: 3 })), fees);

    expect(flip).toMatchObject({ buyPrice: 1000, sellPrice: 1200, profit: 140, percent: 14 });
  });

  it('needs a live buy order', () => {
    expect(findInstantFlip(quotes(quote(1000), quote(1500)), fees)).toBeNull();
  });
  it('buys on any market, including buy-only ones', () => {
    const flip = findInstantFlip(
      quotes(quote(1000), quote(1500, { bid: 1400, bids: 1 }), null, quote(900)),
      fees,
    );

    expect(flip).toMatchObject({ buyOn: MarketId.LisSkins, buyPrice: 900 });
  });
});

describe('buy-only markets', () => {
  it('are never used to sell', () => {
    expect(findListingFlip(quotes(null, null, quote(1000), quote(2000)), fees)).toMatchObject({
      buyOn: MarketId.LisSkins,
      sellOn: MarketId.Csfloat,
    });
  });
});

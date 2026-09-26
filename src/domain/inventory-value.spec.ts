import { sumValues, valueItem } from './inventory-value';
import { MarketId } from './market-links';

const quote = (price: number, bid: number | null = null) => ({
  price,
  listings: 3,
  bid,
  bids: bid ? 1 : 0,
  url: '',
});

const fees = { whiteMarket: 0.05, dmarket: 0.05, csfloat: 0.02 };
const withdrawals = { whiteMarket: 0, dmarket: 0.02, csfloat: 0.025 };

describe('valueItem', () => {
  it('undercuts each market by a cent and takes seller and withdrawal fees', () => {
    const value = valueItem(
      { whiteMarket: quote(10_001), dmarket: quote(10_501, 9_000), csfloat: quote(10_201) },
      fees,
      withdrawals,
    );

    expect(value.options).toEqual([
      {
        market: MarketId.WhiteMarket,
        kind: 'listing',
        price: 10_000,
        afterFee: 9_500,
        payout: 9_500,
      },
      { market: MarketId.Dmarket, kind: 'listing', price: 10_500, afterFee: 9_975, payout: 9_775 },
      { market: MarketId.Csfloat, kind: 'listing', price: 10_200, afterFee: 9_996, payout: 9_746 },
      { market: MarketId.Dmarket, kind: 'instant', price: 9_000, afterFee: 8_550, payout: 8_379 },
    ]);
    expect(value.best?.market).toBe(MarketId.Dmarket);
    expect(value.marketPrice).toBe(10_001);
  });

  it('has no value when nothing is listed or bid', () => {
    expect(
      valueItem({ whiteMarket: null, dmarket: null, csfloat: null }, fees, withdrawals),
    ).toEqual({ options: [], best: null, marketPrice: null });
  });
});

describe('sumValues', () => {
  it('sums payouts per market and multiplies stacked items', () => {
    const value = valueItem(
      { whiteMarket: quote(101), dmarket: null, csfloat: null },
      fees,
      withdrawals,
    );
    const totals = sumValues([{ value, amount: 3 }]);

    expect(totals.listing.whiteMarket).toBe(285);
    expect(totals.listingItems.whiteMarket).toBe(3);
    expect(totals.best).toBe(285);
    expect(totals.marketPrice).toBe(303);
  });
});

import { type Fees, type MarketQuotes } from './comparison';
import { MarketId, SELL_MARKETS, type SellMarketId } from './market-links';

export type MarketMap<T> = Record<SellMarketId, T>;

export interface SaleOption {
  market: SellMarketId;
  kind: 'listing' | 'instant';
  price: number;
  afterFee: number;
  payout: number;
}

export interface ItemValue {
  options: SaleOption[];
  best: SaleOption | null;
  marketPrice: number | null;
}

export type Quotes = Partial<MarketQuotes>;

const ONE_CENT = 1;

const afterShare = (amount: number, share: number): number => Math.floor(amount * (1 - share));

const option = (
  market: SellMarketId,
  kind: SaleOption['kind'],
  price: number,
  fees: Fees,
  withdrawals: Fees,
): SaleOption => {
  const afterFee = afterShare(price, fees[market]);

  return { market, kind, price, afterFee, payout: afterShare(afterFee, withdrawals[market]) };
};

export const valueItem = (quotes: Quotes, fees: Fees, withdrawals: Fees): ItemValue => {
  const options: SaleOption[] = [];
  const listed: number[] = [];

  for (const market of SELL_MARKETS) {
    const quote = quotes[market];

    if (quote && quote.listings > 0 && quote.price !== null && quote.price > ONE_CENT) {
      listed.push(quote.price);
      options.push(option(market, 'listing', quote.price - ONE_CENT, fees, withdrawals));
    }
  }

  const bid = quotes.dmarket?.bid;

  if (bid && bid > 0) {
    options.push(option(MarketId.Dmarket, 'instant', bid, fees, withdrawals));
  }

  const best = options.reduce<SaleOption | null>(
    (top, entry) => (!top || entry.payout > top.payout ? entry : top),
    null,
  );

  return { options, best, marketPrice: listed.length > 0 ? Math.min(...listed) : null };
};

export interface ValueTotals {
  marketPrice: number;
  best: number;
  listing: MarketMap<number>;
  listingItems: MarketMap<number>;
  instant: number;
  instantItems: number;
}

const emptyMarkets = (): MarketMap<number> => ({
  [MarketId.WhiteMarket]: 0,
  [MarketId.Dmarket]: 0,
  [MarketId.Csfloat]: 0,
});

export const sumValues = (values: { value: ItemValue; amount: number }[]): ValueTotals => {
  const totals: ValueTotals = {
    marketPrice: 0,
    best: 0,
    listing: emptyMarkets(),
    listingItems: emptyMarkets(),
    instant: 0,
    instantItems: 0,
  };

  for (const { value, amount } of values) {
    totals.marketPrice += (value.marketPrice ?? 0) * amount;
    totals.best += (value.best?.payout ?? 0) * amount;

    for (const entry of value.options) {
      if (entry.kind === 'instant') {
        totals.instant += entry.payout * amount;
        totals.instantItems += amount;
      } else {
        totals.listing[entry.market] += entry.payout * amount;
        totals.listingItems[entry.market] += amount;
      }
    }
  }

  return totals;
};

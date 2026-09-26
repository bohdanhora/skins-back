import { MarketId, SELL_MARKETS, type SellMarketId } from './market-links';

export interface MarketQuote {
  price: number | null;
  listings: number;
  bid: number | null;
  bids: number;
  url: string;
}

export type MarketQuotes = Record<MarketId, MarketQuote | null>;

export type Fees = Record<SellMarketId, number>;

export interface PriceGap {
  cheaper: MarketId;
  amount: number;
  percent: number;
}

export interface Flip {
  buyOn: MarketId;
  sellOn: MarketId;
  buyPrice: number;
  sellPrice: number;
  profit: number;
  percent: number;
}

const ONE_CENT = 1;

const round2 = (value: number): number => Math.round(value * 100) / 100;

const netAfterFee = (price: number, fee: number): number => Math.floor(price * (1 - fee));

export const listedPrice = (quote: MarketQuote | null | undefined): number | null =>
  quote && quote.listings > 0 && quote.price !== null && quote.price > 0 ? quote.price : null;

export const listedPrices = (quotes: Partial<MarketQuotes>): [MarketId, number][] =>
  Object.values(MarketId)
    .map((market): [MarketId, number | null] => [market, listedPrice(quotes[market])])
    .filter((entry): entry is [MarketId, number] => entry[1] !== null);

export const cheapestPrice = (quotes: Partial<MarketQuotes>): number | null => {
  const prices = listedPrices(quotes).map(([, price]) => price);

  return prices.length > 0 ? Math.min(...prices) : null;
};

export const secondPrice = (quotes: Partial<MarketQuotes>): number | null =>
  listedPrices(quotes)
    .map(([, price]) => price)
    .sort((left, right) => left - right)[1] ?? null;

export const totalListings = (quotes: Partial<MarketQuotes>): number =>
  Object.values(MarketId).reduce((sum, market) => sum + (quotes[market]?.listings ?? 0), 0);

export const deepestListings = (quotes: Partial<MarketQuotes>): number =>
  Math.max(0, ...Object.values(MarketId).map((market) => quotes[market]?.listings ?? 0));

const isSellMarket = (market: MarketId): market is SellMarketId =>
  (SELL_MARKETS as MarketId[]).includes(market);

export const findPriceGap = (quotes: Partial<MarketQuotes>): PriceGap | null => {
  const prices = listedPrices(quotes);

  if (prices.length < 2) {
    return null;
  }

  prices.sort((left, right) => left[1] - right[1]);
  const [cheaper, low] = prices[0];
  const high = prices[1][1];

  if (low === high) {
    return null;
  }

  return { cheaper, amount: high - low, percent: round2(((high - low) / high) * 100) };
};

export const findListingFlip = (quotes: Partial<MarketQuotes>, fees: Fees): Flip | null => {
  const prices = listedPrices(quotes);

  if (prices.length < 2) {
    return null;
  }

  let best: Flip | null = null;

  for (const [buyOn, buyPrice] of prices) {
    for (const [sellOn, listedSellPrice] of prices) {
      if (buyOn === sellOn || !isSellMarket(sellOn)) continue;

      const sellPrice = listedSellPrice - ONE_CENT;
      const profit = netAfterFee(sellPrice, fees[sellOn]) - buyPrice;
      const candidate = {
        buyOn,
        sellOn,
        buyPrice,
        sellPrice,
        profit,
        percent: round2((profit / buyPrice) * 100),
      };

      if (!best || candidate.profit > best.profit) best = candidate;
    }
  }

  return best;
};

export const findInstantFlip = (quotes: Partial<MarketQuotes>, fees: Fees): Flip | null => {
  const dmarket = quotes[MarketId.Dmarket];
  const sellPrice = dmarket && dmarket.bids > 0 ? dmarket.bid : null;
  const cheapest = listedPrices(quotes)
    .filter(([market]) => market !== MarketId.Dmarket)
    .sort((left, right) => left[1] - right[1])[0];

  if (!cheapest || sellPrice === null || sellPrice <= 0) {
    return null;
  }

  const [buyOn, buyPrice] = cheapest;
  const profit = netAfterFee(sellPrice, fees.dmarket) - buyPrice;

  return {
    buyOn,
    sellOn: MarketId.Dmarket,
    buyPrice,
    sellPrice,
    profit,
    percent: round2((profit / buyPrice) * 100),
  };
};

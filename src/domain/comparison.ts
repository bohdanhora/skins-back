import { MarketId } from './market-links';

export interface MarketQuote {
  price: number | null;
  listings: number;
  bid: number | null;
  bids: number;
  url: string;
}

export interface Fees {
  whiteMarket: number;
  dmarket: number;
  csfloat: number;
}

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

const feeFor = (fees: Fees, market: MarketId): number =>
  market === MarketId.WhiteMarket
    ? fees.whiteMarket
    : market === MarketId.Dmarket
      ? fees.dmarket
      : fees.csfloat;

const netAfterFee = (price: number, fee: number): number => Math.floor(price * (1 - fee));

const listedPrice = (quote: MarketQuote | null): number | null =>
  quote && quote.listings > 0 && quote.price !== null && quote.price > 0 ? quote.price : null;

export const findPriceGap = (
  whiteMarket: MarketQuote | null,
  dmarket: MarketQuote | null,
  csfloat: MarketQuote | null = null,
): PriceGap | null => {
  const prices = [
    [MarketId.WhiteMarket, listedPrice(whiteMarket)],
    [MarketId.Dmarket, listedPrice(dmarket)],
    [MarketId.Csfloat, listedPrice(csfloat)],
  ].filter((entry): entry is [MarketId, number] => entry[1] !== null);

  if (prices.length < 2) {
    return null;
  }

  prices.sort((left, right) => left[1] - right[1]);
  const [cheaper, low] = prices[0];
  const high = prices.at(-1)![1];

  if (low === high) {
    return null;
  }

  return { cheaper, amount: high - low, percent: round2(((high - low) / high) * 100) };
};

export const findListingFlip = (
  whiteMarket: MarketQuote | null,
  dmarket: MarketQuote | null,
  csfloat: MarketQuote | null,
  fees: Fees,
): Flip | null => {
  const prices = [
    [MarketId.WhiteMarket, listedPrice(whiteMarket)],
    [MarketId.Dmarket, listedPrice(dmarket)],
    [MarketId.Csfloat, listedPrice(csfloat)],
  ].filter((entry): entry is [MarketId, number] => entry[1] !== null);

  if (prices.length < 2) {
    return null;
  }

  let best: Flip | null = null;

  for (const [buyOn, buyPrice] of prices) {
    for (const [sellOn, listedSellPrice] of prices) {
      if (buyOn === sellOn) continue;

      const sellPrice = listedSellPrice - ONE_CENT;
      const profit = netAfterFee(sellPrice, feeFor(fees, sellOn)) - buyPrice;
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

export const findInstantFlip = (
  whiteMarket: MarketQuote | null,
  dmarket: MarketQuote | null,
  fees: Fees,
): Flip | null => {
  const buyPrice = listedPrice(whiteMarket);
  const sellPrice = dmarket && dmarket.bids > 0 ? dmarket.bid : null;

  if (buyPrice === null || sellPrice === null || sellPrice <= 0) {
    return null;
  }

  const profit = netAfterFee(sellPrice, fees.dmarket) - buyPrice;

  return {
    buyOn: MarketId.WhiteMarket,
    sellOn: MarketId.Dmarket,
    buyPrice,
    sellPrice,
    profit,
    percent: round2((profit / buyPrice) * 100),
  };
};

import { MarketId } from './market-links';

/** All money is kept in whole US cents to avoid floating point drift. */
export interface MarketQuote {
  /** Lowest listing price, or null when nobody sells the item right now. */
  price: number | null;
  listings: number;
  /** Highest buy order: what the market pays instantly. Only DMarket exposes it publicly. */
  bid: number | null;
  bids: number;
  url: string;
}

/** Seller fees as fractions, e.g. 0.05 for 5%. */
export interface Fees {
  whiteMarket: number;
  dmarket: number;
}

export interface PriceGap {
  cheaper: MarketId;
  /** Money kept by buying on the cheaper market instead of the other one. */
  amount: number;
  /** The same as a share of the higher price, 0..100. */
  percent: number;
}

export interface Flip {
  buyOn: MarketId;
  sellOn: MarketId;
  buyPrice: number;
  sellPrice: number;
  profit: number;
  /** Profit relative to what you spend, may be negative. */
  percent: number;
}

const ONE_CENT = 1;

const round2 = (value: number): number => Math.round(value * 100) / 100;

const otherMarket = (market: MarketId): MarketId =>
  market === MarketId.WhiteMarket ? MarketId.Dmarket : MarketId.WhiteMarket;

const feeFor = (fees: Fees, market: MarketId): number =>
  market === MarketId.WhiteMarket ? fees.whiteMarket : fees.dmarket;

const netAfterFee = (price: number, fee: number): number => Math.floor(price * (1 - fee));

const listedPrice = (quote: MarketQuote | null): number | null =>
  quote && quote.listings > 0 && quote.price !== null && quote.price > 0 ? quote.price : null;

export const findPriceGap = (
  whiteMarket: MarketQuote | null,
  dmarket: MarketQuote | null,
): PriceGap | null => {
  const wm = listedPrice(whiteMarket);
  const dm = listedPrice(dmarket);

  if (wm === null || dm === null || wm === dm) {
    return null;
  }

  const cheaper = wm < dm ? MarketId.WhiteMarket : MarketId.Dmarket;
  const low = Math.min(wm, dm);
  const high = Math.max(wm, dm);

  return { cheaper, amount: high - low, percent: round2(((high - low) / high) * 100) };
};

/**
 * Buy the cheapest listing on one market and list it on the other one,
 * one cent under its current lowest price. Not instant: someone has to buy it.
 */
export const findListingFlip = (
  whiteMarket: MarketQuote | null,
  dmarket: MarketQuote | null,
  fees: Fees,
): Flip | null => {
  const gap = findPriceGap(whiteMarket, dmarket);

  if (!gap) {
    return null;
  }

  const buyOn = gap.cheaper;
  const sellOn = otherMarket(buyOn);
  const buyPrice = listedPrice(buyOn === MarketId.WhiteMarket ? whiteMarket : dmarket)!;
  const sellPrice =
    listedPrice(sellOn === MarketId.WhiteMarket ? whiteMarket : dmarket)! - ONE_CENT;
  const profit = netAfterFee(sellPrice, feeFor(fees, sellOn)) - buyPrice;

  return { buyOn, sellOn, buyPrice, sellPrice, profit, percent: round2((profit / buyPrice) * 100) };
};

/** Buy on white.market and sell straight into the best DMarket buy order. */
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

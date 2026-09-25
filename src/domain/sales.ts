/** One day of DMarket sales: how many sold and their average price. */
export interface DailySales {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  /** Average sale price, cents. */
  average: number;
  count: number;
}

export interface SalesStats {
  /**
   * The low end of what the item actually sold for lately, cents.
   * Averages are pulled up by rare floats and stickers, so the lower quartile
   * of daily averages is a truer "normal price" than the plain mean.
   */
  floor: number;
  /** Most recent day with sales. */
  lastDay: string;
  lastAverage: number;
  /** Sold during the last 7 days. */
  weekSales: number;
}

export interface TopOffer {
  /** Price you pay now: the cheapest listing on either market, cents. */
  price: number;
  /**
   * What the item is really worth right now: the recent sales floor, or the
   * other market's lowest listing when that is cheaper. Rare patterns can lift
   * sales averages, but nobody pays more than the next listing.
   */
  reference: number;
  /** How much below the reference, cents and percent. */
  discount: number;
  percent: number;
  /** Best buy order as a share of the price, 0..100+, or null when nobody buys. */
  bidCover: number | null;
}

const DAY_MS = 86_400_000;
const FLOOR_WINDOW_DAYS = 14;
const WEEK_DAYS = 7;
const MIN_SALE_DAYS = 3;
const FLOOR_QUANTILE = 0.25;

const daysAgo = (day: string, now: number): number =>
  Math.floor((now - Date.parse(`${day}T00:00:00Z`)) / DAY_MS);

const quantile = (sorted: number[], q: number): number => {
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower));
};

export const summarizeSales = (days: DailySales[], now = Date.now()): SalesStats | null => {
  const sold = days.filter((entry) => entry.count > 0 && entry.average > 0);
  const recent = sold.filter((entry) => daysAgo(entry.day, now) < FLOOR_WINDOW_DAYS);

  if (recent.length < MIN_SALE_DAYS) {
    return null;
  }

  const last = sold.reduce((latest, entry) => (entry.day > latest.day ? entry : latest));

  return {
    floor: quantile(
      recent.map((entry) => entry.average).sort((a, b) => a - b),
      FLOOR_QUANTILE,
    ),
    lastDay: last.day,
    lastAverage: last.average,
    weekSales: sold
      .filter((entry) => daysAgo(entry.day, now) < WEEK_DAYS)
      .reduce((sum, entry) => sum + entry.count, 0),
  };
};

export const findTopOffer = (
  price: number | null,
  bid: number | null,
  stats: SalesStats | null,
  /** Lowest listing on the market that is not the cheapest one, if any. */
  nextListing: number | null = null,
): TopOffer | null => {
  if (price === null || price <= 0 || !stats) {
    return null;
  }

  const reference = Math.min(stats.floor, nextListing ?? Infinity);

  if (reference <= price) {
    return null;
  }

  const discount = reference - price;

  return {
    price,
    reference,
    discount,
    percent: Math.round((discount / reference) * 10_000) / 100,
    bidCover: bid ? Math.round((bid / price) * 1000) / 10 : null,
  };
};

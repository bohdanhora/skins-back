export interface DailySales {
  day: string;
  average: number;
  count: number;
}

export interface SalesStats {
  floor: number;
  lastDay: string;
  lastAverage: number;
  weekSales: number;
  eightWeekSales?: number;
  eightWeekAverage?: number;
  trendPercent?: number | null;
}

export interface TopOffer {
  price: number;
  reference: number;
  discount: number;
  percent: number;
  bidCover: number | null;
}

const DAY_MS = 86_400_000;
const FLOOR_WINDOW_DAYS = 14;
const WEEK_DAYS = 7;
const CHART_DAYS = 56;
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

  const chart = sold.filter((entry) => daysAgo(entry.day, now) < CHART_DAYS);
  const week = chart.filter((entry) => daysAgo(entry.day, now) < WEEK_DAYS);
  const previousWeek = chart.filter((entry) => {
    const age = daysAgo(entry.day, now);

    return age >= WEEK_DAYS && age < WEEK_DAYS * 2;
  });
  const volume = (entries: DailySales[]): number =>
    entries.reduce((sum, entry) => sum + entry.count, 0);
  const weightedAverage = (entries: DailySales[]): number | null => {
    const count = volume(entries);

    return count > 0
      ? Math.round(entries.reduce((sum, entry) => sum + entry.average * entry.count, 0) / count)
      : null;
  };
  const currentAverage = weightedAverage(week);
  const previousAverage = weightedAverage(previousWeek);

  return {
    floor: quantile(
      recent.map((entry) => entry.average).sort((a, b) => a - b),
      FLOOR_QUANTILE,
    ),
    lastDay: last.day,
    lastAverage: last.average,
    weekSales: volume(week),
    eightWeekSales: volume(chart),
    eightWeekAverage: weightedAverage(chart) ?? last.average,
    trendPercent:
      currentAverage !== null && previousAverage !== null && previousAverage > 0
        ? Math.round(((currentAverage - previousAverage) / previousAverage) * 10_000) / 100
        : null,
  };
};

export const findTopOffer = (
  price: number | null,
  bid: number | null,
  stats: SalesStats | null,
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

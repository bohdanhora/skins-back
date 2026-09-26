import type { BlueShare } from './blue-gem';

export interface PatternSale {
  name: string;
  price: number;
  predicted: number;
  paintSeed: number;
  float: number;
  blue: BlueShare;
  stickerValue: number;
  soldAt: string;
}

export interface BlueComparison {
  comparable: PatternSale[];
  band: [number, number];
  multiplier: number | null;
  baseline: number | null;
  spanDays: number | null;
  checked: number;
}

const MIN_COMPARABLE = 3;
const MIN_BAND = 3;
const BAND_SHARE = 0.15;
const DAY_MS = 86_400_000;
const MIN_RATIO = 0.5;
const MAX_RATIO = 20;
const MAX_AGE_DAYS = 90;

export const saleRatio = (sale: PatternSale): number => sale.price / sale.predicted;

export const median = (values: number[]): number | null => {
  if (values.length === 0) return null;

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export const isCleanSale = (sale: PatternSale): boolean => {
  if (sale.predicted <= 0 || sale.price <= 0) return false;

  const ratio = saleRatio(sale);

  return sale.stickerValue <= sale.predicted && ratio >= MIN_RATIO && ratio <= MAX_RATIO;
};

const within = (sale: PatternSale, [from, to]: [number, number]): boolean =>
  sale.blue.playside >= from && sale.blue.playside <= to;

const bandAround = (playside: number, width: number): [number, number] => [
  Math.max(0, playside - width),
  Math.min(100, playside + width),
];

const spanOf = (sales: PatternSale[]): number | null => {
  const times = sales.map((sale) => Date.parse(sale.soldAt)).filter(Number.isFinite);

  return times.length > 0
    ? Math.max(1, Math.ceil((Math.max(...times) - Math.min(...times)) / DAY_MS))
    : null;
};

export const compareBlue = (
  sales: PatternSale[],
  target: BlueShare,
  now = Date.now(),
): BlueComparison => {
  const since = now - MAX_AGE_DAYS * DAY_MS;
  const clean = sales.filter((sale) => isCleanSale(sale) && Date.parse(sale.soldAt) >= since);
  const baseline = median(clean.map(saleRatio));
  const width = Math.max(MIN_BAND, target.playside * BAND_SHARE);
  let band = bandAround(target.playside, width);
  let comparable = clean.filter((sale) => within(sale, band));

  if (comparable.length < MIN_COMPARABLE) {
    band = bandAround(target.playside, width * 2);
    comparable = clean.filter((sale) => within(sale, band));
  }

  const ratio = comparable.length >= MIN_COMPARABLE ? median(comparable.map(saleRatio)) : null;

  return {
    comparable: comparable.sort(
      (left, right) => Date.parse(right.soldAt) - Date.parse(left.soldAt),
    ),
    band,
    multiplier: ratio !== null && baseline ? ratio / baseline : null,
    baseline,
    spanDays: spanOf(comparable),
    checked: clean.length,
  };
};

const WEAR_SUFFIX = / \((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/;

export const sameSkinOtherWears = (name: string, names: string[]): string[] => {
  const base = name.replace(WEAR_SUFFIX, '');

  return names.filter((entry) => entry.replace(WEAR_SUFFIX, '') === base);
};

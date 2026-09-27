export interface FloatSale {
  price: number;
  float: number | null;
}

export interface SimilarSales {
  count: number;
  median: number;
  low: number;
  high: number;
  floatRange: [number, number];
}

const WINDOWS = [0.01, 0.02, 0.04, 0.08];
const ENOUGH = 5;

const round = (value: number): number => Math.round(value * 10_000) / 10_000;

export const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

export const similarFloatSales = (sales: FloatSale[], float: number): SimilarSales | null => {
  let near: number[] = [];
  let window = WINDOWS[0];

  for (window of WINDOWS) {
    near = sales
      .filter((sale) => sale.float !== null && Math.abs(sale.float - float) <= window)
      .map((sale) => sale.price);

    if (near.length >= ENOUGH) break;
  }

  if (near.length === 0) return null;

  return {
    count: near.length,
    median: median(near),
    low: Math.min(...near),
    high: Math.max(...near),
    floatRange: [round(Math.max(0, float - window)), round(Math.min(1, float + window))],
  };
};

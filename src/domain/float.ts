export type FloatRange = readonly [from: number, to: number];

/**
 * DMarket groups floats into buckets for buy orders ("FT-2" and so on).
 * Each exterior is split into narrow low-float buckets plus one wide tail.
 */
export const DMARKET_FLOAT_PARTS: Record<string, FloatRange> = {
  'FN-0': [0, 0.01],
  'FN-1': [0.01, 0.02],
  'FN-2': [0.02, 0.03],
  'FN-3': [0.03, 0.04],
  'FN-4': [0.04, 0.05],
  'FN-5': [0.05, 0.06],
  'FN-6': [0.06, 0.07],
  'MW-0': [0.07, 0.08],
  'MW-1': [0.08, 0.09],
  'MW-2': [0.09, 0.1],
  'MW-3': [0.1, 0.11],
  'MW-4': [0.11, 0.15],
  'FT-0': [0.15, 0.18],
  'FT-1': [0.18, 0.21],
  'FT-2': [0.21, 0.24],
  'FT-3': [0.24, 0.27],
  'FT-4': [0.27, 0.38],
  'WW-0': [0.38, 0.39],
  'WW-1': [0.39, 0.4],
  'WW-2': [0.4, 0.41],
  'WW-3': [0.41, 0.42],
  'WW-4': [0.42, 0.45],
  'BS-0': [0.45, 0.5],
  'BS-1': [0.5, 0.63],
  'BS-2': [0.63, 0.76],
  'BS-3': [0.76, 0.9],
  'BS-4': [0.9, 1],
};

export const inRange = (value: number, from?: number, to?: number): boolean =>
  (from === undefined || value >= from) && (to === undefined || value <= to);

/**
 * A buy order limited to a float bucket only counts when that bucket shares
 * more than a boundary point with the searched range.
 */
export const overlaps = (range: FloatRange, from?: number, to?: number): boolean =>
  (to === undefined || range[0] < to) && (from === undefined || range[1] > from);

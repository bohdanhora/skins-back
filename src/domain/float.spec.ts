import { DMARKET_FLOAT_PARTS, inRange, overlaps } from './float';

describe('float helpers', () => {
  it('covers 0..1 without gaps', () => {
    const ranges = Object.values(DMARKET_FLOAT_PARTS);

    expect(ranges[0][0]).toBe(0);
    expect(ranges.at(-1)![1]).toBe(1);
    ranges.slice(1).forEach((range, index) => expect(range[0]).toBe(ranges[index][1]));
  });

  it('matches the documented example: 0.2356 is FT-2', () => {
    expect(inRange(0.2356, ...DMARKET_FLOAT_PARTS['FT-2'])).toBe(true);
  });

  it('checks open ranges', () => {
    expect(inRange(0.3, undefined, 0.35)).toBe(true);
    expect(inRange(0.3, 0.31)).toBe(false);
  });

  it('keeps a bucket only when it really overlaps the searched range', () => {
    expect(overlaps([0.15, 0.18], 0.17, 0.2)).toBe(true);
    expect(overlaps([0.15, 0.18], 0.19, 0.2)).toBe(false);
    expect(overlaps([0.18, 0.21], 0.15, 0.18)).toBe(false);
    expect(overlaps([0.15, 0.18])).toBe(true);
  });
});

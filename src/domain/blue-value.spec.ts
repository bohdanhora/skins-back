import {
  compareBlue,
  isCleanSale,
  median,
  sameSkinOtherWears,
  type PatternSale,
} from './blue-value';

const sale = (playside: number, ratio: number, extra: Partial<PatternSale> = {}): PatternSale => ({
  name: 'AK-47 | Case Hardened (Minimal Wear)',
  price: Math.round(10_000 * ratio),
  predicted: 10_000,
  paintSeed: 1,
  float: 0.1,
  blue: { playside, backside: 0 },
  stickerValue: 0,
  soldAt: '2026-09-20T00:00:00Z',
  ...extra,
});

const NOW = Date.parse('2026-09-26T00:00:00Z');

describe('blue value', () => {
  it('takes the median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('skips sales carried by expensive stickers', () => {
    expect(isCleanSale(sale(10, 1.5, { stickerValue: 50_000 }))).toBe(false);
    expect(isCleanSale(sale(10, 1.5, { stickerValue: 500 }))).toBe(true);
  });

  it('prices a blue pattern against sales with a similar blue share', () => {
    const sales = [
      sale(2, 1),
      sale(5, 1),
      sale(8, 0.98),
      sale(12, 1.02),
      sale(40, 1.8),
      sale(42, 1.9, { soldAt: '2026-09-25T00:00:00Z' }),
      sale(45, 2),
    ];
    const result = compareBlue(sales, { playside: 43, backside: 1 }, NOW);

    expect(result.comparable.map((entry) => entry.blue.playside)).toEqual([42, 40, 45]);
    expect(result.multiplier).toBeCloseTo(1.9 / 1.02, 2);
    expect(result.spanDays).toBe(5);
  });

  it('widens the band before giving up', () => {
    const sales = [sale(30, 1.2), sale(33, 1.25), sale(22, 1.1), sale(5, 1)];
    const result = compareBlue(sales, { playside: 27, backside: 0 }, NOW);

    expect(result.comparable).toHaveLength(3);
    expect(result.multiplier).not.toBeNull();
  });

  it('gives no multiplier without enough comparable sales', () => {
    expect(
      compareBlue([sale(60, 3), sale(5, 1)], { playside: 60, backside: 0 }, NOW).multiplier,
    ).toBeNull();
  });

  it('ignores sales older than three months', () => {
    const old = { soldAt: '2025-01-01T00:00:00Z' };
    const result = compareBlue(
      [sale(40, 3, old), sale(41, 3, old), sale(42, 3, old), sale(40, 1.5), sale(5, 1)],
      { playside: 41, backside: 0 },
      NOW,
    );

    expect(result.checked).toBe(2);
    expect(result.multiplier).toBeNull();
  });

  it('lists the other wears of the same skin', () => {
    expect(
      sameSkinOtherWears('StatTrak™ AK-47 | Case Hardened (Minimal Wear)', [
        'AK-47 | Case Hardened (Minimal Wear)',
        'StatTrak™ AK-47 | Case Hardened (Field-Tested)',
        'StatTrak™ AK-47 | Case Hardened (Minimal Wear)',
      ]),
    ).toEqual([
      'StatTrak™ AK-47 | Case Hardened (Field-Tested)',
      'StatTrak™ AK-47 | Case Hardened (Minimal Wear)',
    ]);
  });
});

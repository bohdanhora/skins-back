import { TradeUpTier, tradeUpMarketName, tradeUpTier, wearsInRange } from './trade-up';

describe('trade-up names', () => {
  it('builds market names for every quality', () => {
    expect(tradeUpMarketName('AK-47 | Redline', 'FT', false)).toBe(
      'AK-47 | Redline (Field-Tested)',
    );
    expect(tradeUpMarketName('AK-47 | Redline', 'MW', true)).toBe(
      'StatTrak™ AK-47 | Redline (Minimal Wear)',
    );
    expect(tradeUpMarketName('★ Karambit | Fade', 'FN', true)).toBe(
      '★ StatTrak™ Karambit | Fade (Factory New)',
    );
    expect(tradeUpMarketName('★ Karambit', null, false)).toBe('★ Karambit');
  });

  it('puts knives and gloves above Covert', () => {
    expect(tradeUpTier('★ Karambit | Fade', 'Covert')).toBe(TradeUpTier.Rare);
    expect(tradeUpTier('★ Sport Gloves | Vice', 'Extraordinary')).toBe(TradeUpTier.Rare);
    expect(tradeUpTier('AK-47 | Redline', 'Classified')).toBe(TradeUpTier.Classified);
    expect(tradeUpTier('M4A4 | Howl', 'Contraband')).toBeNull();
  });

  it('keeps only wears the float range reaches', () => {
    expect(wearsInRange(0.1, 0.7)).toEqual(['MW', 'FT', 'WW', 'BS']);
    expect(wearsInRange(0, 0.08)).toEqual(['FN', 'MW']);
  });
});

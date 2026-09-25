import {
  normalizeMarketPhase,
  paintIndexForPhase,
  parseVariantName,
  phaseFromPaintIndex,
  variantName,
} from './market-variant';

describe('market variants', () => {
  it('normalizes every spelling used by white.market and DMarket', () => {
    expect(normalizeMarketPhase('PHASE1')).toBe('phase-1');
    expect(normalizeMarketPhase('phase-2')).toBe('phase-2');
    expect(normalizeMarketPhase('BLACK_PEARL')).toBe('black-pearl');
    expect(normalizeMarketPhase('Sapphire')).toBe('sapphire');
  });

  it('keeps a Doppler phase in the item identity without changing its Steam name', () => {
    const name = variantName('★ Karambit | Doppler (Factory New)', 'sapphire');

    expect(name).toBe('★ Karambit | Doppler (Factory New) [Sapphire]');
    expect(parseVariantName(name)).toEqual({
      marketHashName: '★ Karambit | Doppler (Factory New)',
      phase: 'sapphire',
    });
  });

  it('maps Doppler and Gamma Doppler paint indexes', () => {
    expect(phaseFromPaintIndex(416)).toBe('sapphire');
    expect(phaseFromPaintIndex(568)).toBe('emerald');
    expect(paintIndexForPhase('★ Bayonet | Doppler (Factory New)', 'sapphire')).toBe(416);
    expect(paintIndexForPhase('★ Bayonet | Gamma Doppler (Factory New)', 'phase-2')).toBe(570);
  });
});

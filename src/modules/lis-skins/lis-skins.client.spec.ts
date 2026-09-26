import { mapLisSkinsPrices, splitLisSkinsName } from './lis-skins.client';

describe('lis-skins prices', () => {
  it('reads the Doppler phase from the name', () => {
    expect(splitLisSkinsName('★ StatTrak™ Karambit | Doppler Black Pearl (Factory New)')).toEqual({
      marketHashName: '★ StatTrak™ Karambit | Doppler (Factory New)',
      phase: 'black-pearl',
    });
    expect(splitLisSkinsName('★ Karambit | Gamma Doppler Phase 2 (Minimal Wear)')).toEqual({
      marketHashName: '★ Karambit | Gamma Doppler (Minimal Wear)',
      phase: 'phase-2',
    });
    expect(splitLisSkinsName('AK-47 | Redline (Field-Tested)').phase).toBeNull();
  });

  it('keeps rare phases apart and prices the plain name by ordinary phases', () => {
    const row = (name: string, price: number, count = 2) => ({ name, price, url: name, count });
    const prices = mapLisSkinsPrices([
      row('★ Karambit | Doppler Sapphire (Factory New)', 4500),
      row('★ Karambit | Doppler Phase 1 (Factory New)', 1254.32, 3),
      row('★ Karambit | Doppler Phase 4 (Factory New)', 1350),
      row('AK-47 | Redline (Field-Tested)', 12.5, 0),
    ]);

    expect(prices.get('★ Karambit | Doppler (Factory New)')).toEqual({
      price: 125_432,
      listings: 5,
      url: '★ Karambit | Doppler Phase 1 (Factory New)',
    });
    expect(prices.get('★ Karambit | Doppler (Factory New) [Sapphire]')?.price).toBe(450_000);
    expect(prices.has('AK-47 | Redline (Field-Tested)')).toBe(false);
  });
});

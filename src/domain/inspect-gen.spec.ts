import { genCommand, itemQuality, previewHex } from './inspect-gen';

describe('inspect generator', () => {
  it('builds the same preview data as the reference library', () => {
    expect(
      previewHex({
        defindex: 7,
        paintindex: 474,
        rarity: 6,
        paintwear: 0.6336590647697449,
        paintseed: 306,
        stickers: [{ slot: 3, stickerId: 2, wear: 0, scale: 1, rotation: 0 }],
      }),
    ).toBe('00180720DA03280638FBEE88F90340B2026213080310021D00000000250000803F2D00000000503D5A64');
  });

  it('matches a Karambit Doppler Phase 1 link from cs2inspects', () => {
    expect(
      previewHex({
        defindex: 507,
        paintindex: 418,
        rarity: 6,
        paintwear: 0.068799056113,
        paintseed: 799,
      }),
    ).toMatch(/^0018FB0320A20328063885CDB3EC03409F06/);
  });

  it('marks StatTrak and Souvenir items with their quality', () => {
    expect(itemQuality('StatTrak™ Desert Eagle | Bronze Deco (Factory New)')).toBe(9);
    expect(itemQuality('Souvenir AWP | Dragon Lore (Factory New)')).toBe(12);
    expect(itemQuality('★ StatTrak™ Karambit | Doppler (Factory New)')).toBe(3);
    expect(itemQuality('★ Karambit | Doppler (Factory New)')).toBeUndefined();
    expect(itemQuality('AK-47 | Redline (Field-Tested)')).toBeUndefined();
    expect(
      previewHex({
        defindex: 1,
        paintindex: 425,
        quality: 9,
        paintwear: 0.0668,
        paintseed: 177,
        stattrak: true,
      }),
    ).toMatch(/^00180120A903300938[0-9A-F]+40B10148005000/);
  });

  it('writes a gen command with five sticker slots', () => {
    expect(
      genCommand({
        defindex: 7,
        paintindex: 282,
        paintwear: 0.15,
        paintseed: 661,
        stickers: [{ slot: 1, stickerId: 8574, wear: 0 }],
      }),
    ).toBe('!gen 7 282 661 0.15 0 0 8574 0 0 0 0 0 0 0');
  });
});

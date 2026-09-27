import { genCommand, itemQuality, previewHex, readPreview } from './inspect-gen';

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

  it('keeps the slot, scrape and custom placement of a sticker', () => {
    expect(
      previewHex({
        defindex: 7,
        paintindex: 282,
        paintwear: 0.15,
        paintseed: 1,
        stickers: [{ slot: 2, stickerId: 974, wear: 0.5, offsetX: 0.05, offsetY: -0.01 }],
      }),
    ).toContain('6214080210CE071D0000003F3DCDCC4C3D450AD723BC');
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

  it('reads the real sticker slots and placement from a masked market link', () => {
    const preview = readPreview(
      'steam://run/730//+csgo_econ_action_preview%20EDFD3954006B52ECF5C9CD6FEFC5E8DDE4D5580F061EEEAD7BEEA5EDBDED8FE8E5EEFD68EC8FE2E5EBFD01A4D0CF0C35D3A8CD6FAED1856E6D6D6DE19DE5EBA1F81D',
    );

    expect(preview?.paintseed).toBe(406);
    expect(preview?.stickers).toEqual([
      { slot: 3, stickerId: 133 },
      {
        slot: 6,
        stickerId: 9452,
        offsetX: expect.closeTo(0.4236, 4) as number,
        offsetY: expect.closeTo(0.0119, 4) as number,
      },
    ]);
  });

  it('reads an unmasked link and its scraped stickers', () => {
    const preview = readPreview(
      'steam://run/730/en/+csgo_econ_action_preview%200010B9E48FF3BA011810209B0128063004388AC1B6F1034092036205080010881B6205080110DD1F6205080210891B6205080310C72168E3017008AF17D1CA',
    );

    expect(preview?.paintseed).toBe(402);
    expect(preview?.stickers.map((sticker) => sticker.slot)).toEqual([0, 1, 2, 3]);
  });

  it('ignores anything that is not a preview link', () => {
    expect(
      readPreview('steam://rungame/730/76561202255233023/+csgo_econ_action_preview S1A2D3'),
    ).toBeNull();
    expect(readPreview(null)).toBeNull();
  });

  it('lists far slots in order when the gen command has only five', () => {
    expect(
      genCommand({
        defindex: 36,
        paintindex: 258,
        paintwear: 0.25,
        paintseed: 406,
        stickers: [
          { slot: 6, stickerId: 9452, wear: 0 },
          { slot: 3, stickerId: 133, wear: 0 },
        ],
      }),
    ).toBe('!gen 36 258 406 0.25 133 0 9452 0 0 0 0 0 0 0');
  });
});

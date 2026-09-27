import { type PreviewData } from './inspect-gen';
import { placeFromPreview, type AppliedSticker } from './listing';

const sticker = (name: string): AppliedSticker => ({
  name,
  image: null,
  slot: null,
  wear: null,
  offsetX: null,
  offsetY: null,
  rotation: null,
  scale: null,
});

const preview: PreviewData = {
  paintseed: 406,
  stickers: [
    { slot: 3, stickerId: 133 },
    { slot: 6, stickerId: 9452, wear: 0.4, offsetX: 0.42, offsetY: 0.01 },
  ],
};

describe('placeFromPreview', () => {
  it('takes the real slot and placement from the item link by sticker id', () => {
    const placed = placeFromPreview(
      [
        sticker('Sticker | Cubix Connexion'),
        sticker('Sticker | Team LDLC.com (Holo) | Cologne 2014'),
      ],
      preview,
      [9452, 133],
    );

    expect(placed.map((entry) => [entry.name, entry.slot, entry.wear, entry.offsetX])).toEqual([
      ['Sticker | Team LDLC.com (Holo) | Cologne 2014', 3, null, null],
      ['Sticker | Cubix Connexion', 6, 0.4, 0.42],
    ]);
  });

  it('matches by order without ids and leaves stickers alone when counts differ', () => {
    const stickers = [sticker('A'), sticker('B')];

    expect(placeFromPreview(stickers, preview).map((entry) => entry.slot)).toEqual([3, 6]);
    expect(placeFromPreview([sticker('A')], preview)).toEqual([sticker('A')]);
    expect(placeFromPreview(stickers, null)).toBe(stickers);
  });
});

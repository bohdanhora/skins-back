import { ItemCategory } from '../../domain/categories';
import { type IndexedItem } from './item-index.service';
import { buildItemLibrary } from './item-library';

const item = (name: string, category: ItemCategory, price: number): IndexedItem => ({
  name,
  searchName: name.toLowerCase(),
  image: `${name}.png`,
  rarity: null,
  rarityColor: null,
  category,
  phase: name.includes('[Sapphire]') ? 'sapphire' : null,
  collections: [],
  whiteMarket: { price, listings: 2, bid: null, bids: 0, url: '' },
  dmarket: null,
  csfloat: null,
});

describe('item library', () => {
  const rows = [
    item('AK-47 | Redline (Field-Tested)', ItemCategory.Rifle, 2500),
    item('StatTrak™ AK-47 | Redline (Minimal Wear)', ItemCategory.Rifle, 9000),
    item('AWP | Asiimov (Field-Tested)', ItemCategory.Sniper, 12000),
    item('★ Bayonet | Doppler (Factory New) [Sapphire]', ItemCategory.Knife, 110000),
  ];

  it('groups weapons and skins inside a category', () => {
    const library = buildItemLibrary(rows, { category: ItemCategory.Rifle, weapon: 'AK-47' });

    expect(library.weapons.map((entry) => entry.value)).toEqual(['AK-47']);
    expect(library.skins).toEqual([
      expect.objectContaining({ value: 'Redline', count: 2, price: 2500 }),
    ]);
  });

  it('returns exact variants for opening search tools', () => {
    const library = buildItemLibrary(rows, {
      category: ItemCategory.Knife,
      weapon: 'Bayonet',
      skin: 'Doppler',
    });

    expect(library.variants[0]).toMatchObject({
      name: '★ Bayonet | Doppler (Factory New) [Sapphire]',
      phase: 'sapphire',
    });
  });
});

import { ItemCategory, detectCategory, detectSubcategory } from './categories';

describe('detectCategory', () => {
  it.each([
    ['AK-47 | Redline (Field-Tested)', ItemCategory.Rifle],
    ['StatTrak™ AWP | Asiimov (Battle-Scarred)', ItemCategory.Sniper],
    ['Souvenir P250 | Sand Dune (Factory New)', ItemCategory.Pistol],
    ['★ Karambit | Doppler (Factory New)', ItemCategory.Knife],
    ['★ Sport Gloves | Vice (Field-Tested)', ItemCategory.Gloves],
    ['★ Hand Wraps | Slaughter (Minimal Wear)', ItemCategory.Gloves],
    ['Sticker | Natus Vincere | Katowice 2019', ItemCategory.Sticker],
    ['Charm | Lil Ava', ItemCategory.Charm],
    ['Revolution Case', ItemCategory.Container],
    ['Name Tag', ItemCategory.Other],
  ])('%s', (name, expected) => {
    expect(detectCategory(name)).toBe(expected);
  });

  it('trusts the metadata type for agents', () => {
    expect(detectCategory("'Two Times' McCoy | TACP Cavalry", 'agent')).toBe(ItemCategory.Agent);
  });
});

describe('detectSubcategory', () => {
  it.each([
    ['★ StatTrak™ Karambit | Doppler (Factory New) [Sapphire]', ItemCategory.Knife, 'Karambit'],
    ['StatTrak™ AK-47 | Redline (Field-Tested)', ItemCategory.Rifle, 'AK-47'],
    ['★ Sport Gloves | Vice (Field-Tested)', ItemCategory.Gloves, 'Sport Gloves'],
    ['Sticker | Natus Vincere (Holo) | Katowice 2019', ItemCategory.Sticker, 'Katowice 2019'],
    ['Sticker | Lil Ava', ItemCategory.Sticker, null],
    ['Revolution Case', ItemCategory.Container, null],
  ])('%s', (name, category, expected) => {
    expect(detectSubcategory(name, category)).toBe(expected);
  });
});

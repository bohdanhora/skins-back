export enum ItemCategory {
  Knife = 'knife',
  Gloves = 'gloves',
  Rifle = 'rifle',
  Sniper = 'sniper',
  Pistol = 'pistol',
  Smg = 'smg',
  Heavy = 'heavy',
  Sticker = 'sticker',
  Container = 'container',
  Agent = 'agent',
  Charm = 'charm',
  Other = 'other',
}

const WEAPON_CATEGORIES: Record<string, ItemCategory> = {
  'AK-47': ItemCategory.Rifle,
  M4A4: ItemCategory.Rifle,
  'M4A1-S': ItemCategory.Rifle,
  FAMAS: ItemCategory.Rifle,
  'Galil AR': ItemCategory.Rifle,
  AUG: ItemCategory.Rifle,
  'SG 553': ItemCategory.Rifle,
  AWP: ItemCategory.Sniper,
  'SSG 08': ItemCategory.Sniper,
  'SCAR-20': ItemCategory.Sniper,
  G3SG1: ItemCategory.Sniper,
  'Glock-18': ItemCategory.Pistol,
  'USP-S': ItemCategory.Pistol,
  P2000: ItemCategory.Pistol,
  P250: ItemCategory.Pistol,
  'Five-SeveN': ItemCategory.Pistol,
  'Tec-9': ItemCategory.Pistol,
  'CZ75-Auto': ItemCategory.Pistol,
  'Desert Eagle': ItemCategory.Pistol,
  'Dual Berettas': ItemCategory.Pistol,
  'R8 Revolver': ItemCategory.Pistol,
  'Zeus x27': ItemCategory.Pistol,
  'MAC-10': ItemCategory.Smg,
  MP9: ItemCategory.Smg,
  MP7: ItemCategory.Smg,
  'MP5-SD': ItemCategory.Smg,
  'UMP-45': ItemCategory.Smg,
  P90: ItemCategory.Smg,
  'PP-Bizon': ItemCategory.Smg,
  Nova: ItemCategory.Heavy,
  XM1014: ItemCategory.Heavy,
  'Sawed-Off': ItemCategory.Heavy,
  'MAG-7': ItemCategory.Heavy,
  M249: ItemCategory.Heavy,
  Negev: ItemCategory.Heavy,
};

const GLOVE_MARKERS = ['Gloves', 'Hand Wraps'];
const CONTAINER_MARKERS = [
  ' Case',
  'Capsule',
  'Package',
  'Souvenir Package',
  'Terminal',
  'Pin Pack',
];
const WEAPON_PREFIXES = /^(StatTrak™ |Souvenir )/;

/** Metadata type (the prefix of a catalog id such as `agent-4613`) wins over name heuristics. */
export const detectCategory = (name: string, metadataType?: string): ItemCategory => {
  if (metadataType === 'agent') {
    return ItemCategory.Agent;
  }

  if (name.startsWith('Sticker |')) {
    return ItemCategory.Sticker;
  }

  if (name.startsWith('Charm |') || name.startsWith('Souvenir Charm |')) {
    return ItemCategory.Charm;
  }

  if (name.startsWith('★')) {
    return GLOVE_MARKERS.some((marker) => name.includes(marker))
      ? ItemCategory.Gloves
      : ItemCategory.Knife;
  }

  const weapon = name.replace(WEAPON_PREFIXES, '').split(' | ')[0];
  const weaponCategory = WEAPON_CATEGORIES[weapon];

  if (weaponCategory && name.includes(' | ')) {
    return weaponCategory;
  }

  if (metadataType === 'crate' || CONTAINER_MARKERS.some((marker) => name.includes(marker))) {
    return ItemCategory.Container;
  }

  return ItemCategory.Other;
};

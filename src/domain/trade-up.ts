export enum TradeUpTier {
  Consumer = 'consumer',
  Industrial = 'industrial',
  MilSpec = 'milspec',
  Restricted = 'restricted',
  Classified = 'classified',
  Covert = 'covert',
  Rare = 'rare',
}

export const WEAR_CODES = ['FN', 'MW', 'FT', 'WW', 'BS'] as const;

export type WearCode = (typeof WEAR_CODES)[number];

export const WEAR_TITLES: Record<WearCode, string> = {
  FN: 'Factory New',
  MW: 'Minimal Wear',
  FT: 'Field-Tested',
  WW: 'Well-Worn',
  BS: 'Battle-Scarred',
};

export const WEAR_RANGES: Record<WearCode, [number, number]> = {
  FN: [0, 0.07],
  MW: [0.07, 0.15],
  FT: [0.15, 0.38],
  WW: [0.38, 0.45],
  BS: [0.45, 1],
};

const TIERS: Record<string, TradeUpTier> = {
  'Consumer Grade': TradeUpTier.Consumer,
  'Industrial Grade': TradeUpTier.Industrial,
  'Mil-Spec Grade': TradeUpTier.MilSpec,
  Restricted: TradeUpTier.Restricted,
  Classified: TradeUpTier.Classified,
  Covert: TradeUpTier.Covert,
  Extraordinary: TradeUpTier.Rare,
};

const RARE_PREFIX = '★ ';

export const tradeUpTier = (name: string, rarity: string): TradeUpTier | null =>
  name.startsWith(RARE_PREFIX) ? TradeUpTier.Rare : (TIERS[rarity] ?? null);

export const wearsInRange = (minFloat: number, maxFloat: number): WearCode[] =>
  WEAR_CODES.filter((wear) => WEAR_RANGES[wear][0] < maxFloat && WEAR_RANGES[wear][1] > minFloat);

export const tradeUpMarketName = (
  name: string,
  wear: WearCode | null,
  statTrak: boolean,
): string => {
  const suffix = wear ? ` (${WEAR_TITLES[wear]})` : '';

  if (!statTrak) return `${name}${suffix}`;

  return name.startsWith(RARE_PREFIX)
    ? `${RARE_PREFIX}StatTrak™ ${name.slice(RARE_PREFIX.length)}${suffix}`
    : `StatTrak™ ${name}${suffix}`;
};

export const MARKET_PHASES = [
  'phase-1',
  'phase-2',
  'phase-3',
  'phase-4',
  'ruby',
  'sapphire',
  'emerald',
  'black-pearl',
] as const;

export type MarketPhase = (typeof MARKET_PHASES)[number];

const PHASE_LABELS: Record<MarketPhase, string> = {
  'phase-1': 'Phase 1',
  'phase-2': 'Phase 2',
  'phase-3': 'Phase 3',
  'phase-4': 'Phase 4',
  ruby: 'Ruby',
  sapphire: 'Sapphire',
  emerald: 'Emerald',
  'black-pearl': 'Black Pearl',
};

const LABEL_TO_PHASE = new Map(
  Object.entries(PHASE_LABELS).map(([phase, label]) => [label.toLowerCase(), phase as MarketPhase]),
);
const VARIANT_SUFFIX = / \[([^\]]+)\]$/;

export const normalizeMarketPhase = (value: string | null | undefined): MarketPhase | null => {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll('_', '-')
    .replace(/^phase[- ]?([1-4])$/, 'phase-$1');

  if (MARKET_PHASES.includes(normalized as MarketPhase)) {
    return normalized as MarketPhase;
  }

  return LABEL_TO_PHASE.get(value.trim().toLowerCase()) ?? null;
};

export const phaseLabel = (phase: MarketPhase): string => PHASE_LABELS[phase];

export const variantName = (marketHashName: string, phase: MarketPhase | null): string =>
  phase ? `${marketHashName} [${phaseLabel(phase)}]` : marketHashName;

export interface ParsedVariantName {
  marketHashName: string;
  phase: MarketPhase | null;
}

export const parseVariantName = (name: string): ParsedVariantName => {
  const match = name.match(VARIANT_SUFFIX);
  const phase = normalizeMarketPhase(match?.[1]);

  return phase && match?.index !== undefined
    ? { marketHashName: name.slice(0, match.index), phase }
    : { marketHashName: name, phase: null };
};

export const isCommonDopplerPhase = (phase: MarketPhase): boolean =>
  phase === 'phase-1' || phase === 'phase-2' || phase === 'phase-3' || phase === 'phase-4';

const PAINT_INDEX_PHASES: Record<number, MarketPhase> = {
  415: 'ruby',
  416: 'sapphire',
  417: 'black-pearl',
  418: 'phase-1',
  419: 'phase-2',
  420: 'phase-3',
  421: 'phase-4',
  568: 'emerald',
  569: 'phase-1',
  570: 'phase-2',
  571: 'phase-3',
  572: 'phase-4',
};

const DOPPLER_PHASE_PAINT_INDEX: Partial<Record<MarketPhase, number>> = {
  ruby: 415,
  sapphire: 416,
  'black-pearl': 417,
  'phase-1': 418,
  'phase-2': 419,
  'phase-3': 420,
  'phase-4': 421,
};

const GAMMA_DOPPLER_PHASE_PAINT_INDEX: Partial<Record<MarketPhase, number>> = {
  emerald: 568,
  'phase-1': 569,
  'phase-2': 570,
  'phase-3': 571,
  'phase-4': 572,
};

export const phaseFromPaintIndex = (paintIndex: number): MarketPhase | null =>
  PAINT_INDEX_PHASES[paintIndex] ?? null;

export const paintIndexForPhase = (name: string, phase: MarketPhase): number | null => {
  const indexes = name.includes('Gamma Doppler')
    ? GAMMA_DOPPLER_PHASE_PAINT_INDEX
    : name.includes('Doppler')
      ? DOPPLER_PHASE_PAINT_INDEX
      : null;

  return indexes?.[phase] ?? null;
};

import BlueGemCalculator, { type SeedPercentages } from 'csgo-blue-gem-calculator';

export interface BlueShare {
  playside: number;
  backside: number;
}

const CASE_HARDENED = 'Case Hardened';
const MAX_SEED = 1000;

const calculator = new BlueGemCalculator();

export const CASE_HARDENED_WEAPONS: readonly string[] = calculator.getSupportedItems(CASE_HARDENED);

const supported = new Set(CASE_HARDENED_WEAPONS);
const rankings = new Map<string, number[]>();

const toShare = (result: SeedPercentages): BlueShare | null => {
  const front = result.playside ?? result.top;
  const back = result.backside ?? result.magazine;

  return front && back ? { playside: front.blue, backside: back.blue } : null;
};

export const caseHardenedWeapon = (name: string): string | null => {
  const [weapon, skin] = name
    .replace(/^★\s*/, '')
    .replace(/^(StatTrak™|Souvenir)\s+/, '')
    .split(' | ');

  if (!skin || !skin.startsWith(CASE_HARDENED)) return null;

  return supported.has(weapon) ? weapon : null;
};

export const weaponBlueShare = (weapon: string, paintSeed: number | null): BlueShare | null => {
  if (
    !supported.has(weapon) ||
    paintSeed === null ||
    !Number.isInteger(paintSeed) ||
    paintSeed < 0 ||
    paintSeed > MAX_SEED
  ) {
    return null;
  }

  return toShare(calculator.getPercentages(CASE_HARDENED, weapon, paintSeed));
};

export const blueShare = (name: string, paintSeed: number | null): BlueShare | null => {
  const weapon = caseHardenedWeapon(name);

  return weapon === null ? null : weaponBlueShare(weapon, paintSeed);
};

export const bluestSeeds = (weapon: string, count: number): number[] => {
  if (!supported.has(weapon)) return [];

  let ranking = rankings.get(weapon);

  if (!ranking) {
    ranking = calculator
      .getAllPercentages(CASE_HARDENED, weapon)
      .percentages.map((result) => ({ seed: result.seed, share: toShare(result) }))
      .filter((entry): entry is { seed: number; share: BlueShare } => entry.share !== null)
      .sort(
        (left, right) =>
          right.share.playside - left.share.playside || right.share.backside - left.share.backside,
      )
      .map((entry) => entry.seed);
    rankings.set(weapon, ranking);
  }

  return ranking.slice(0, count);
};

export type BluePose = 'playside' | 'backside' | 'frontview';

const POSE_BASE = 'https://cdn.csgoskins.gg/public/images/gems/v2/poses/';

const POSE_KEYS: Record<string, string> = {
  'AK-47': 'ak47',
  Bayonet: 'bayonet',
  'Bowie Knife': 'bowie',
  'Butterfly Knife': 'butterfly',
  'Classic Knife': 'classic',
  'Falchion Knife': 'falchion',
  'Five-SeveN': 'fiveseven',
  'Flip Knife': 'flip',
  'Gut Knife': 'gut',
  'Huntsman Knife': 'huntsman',
  Karambit: 'karambit',
  'Kukri Knife': 'kukri',
  'M9 Bayonet': 'm9_bayonet',
  'MAC-10': 'mac10',
  'Navaja Knife': 'navaja',
  'Nomad Knife': 'nomad',
  'Paracord Knife': 'paracord',
  'Shadow Daggers': 'shadow',
  'Skeleton Knife': 'skeleton',
  'Stiletto Knife': 'stiletto',
  'Survival Knife': 'survival',
  'Talon Knife': 'talon',
  'Ursus Knife': 'ursus',
};

const SINGLE_SIDE = new Set(['Falchion Knife', 'Five-SeveN', 'MAC-10']);

export const blueGemPoses = (name: string): { pose: BluePose; base: string }[] => {
  const weapon = caseHardenedWeapon(name);
  const key = weapon ? POSE_KEYS[weapon] : undefined;

  if (!weapon || !key) return [];

  const poses: BluePose[] =
    weapon === 'AK-47'
      ? ['playside', 'frontview']
      : SINGLE_SIDE.has(weapon)
        ? ['playside']
        : ['playside', 'backside'];

  return poses.map((pose) => ({ pose, base: `${POSE_BASE}${key}_ch_${pose}_` }));
};

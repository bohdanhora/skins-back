import {
  AcidFadeCalculator,
  AmberFadeCalculator,
  FadeCalculator,
} from 'csgo-fade-percentage-calculator';

const NAME = /^(?:★ )?(?:StatTrak™ |Souvenir )?(.+?) \| (.+?)(?: \(.+\))?$/;

const CALCULATORS = {
  Fade: FadeCalculator,
  'Amber Fade': AmberFadeCalculator,
  'Acid Fade': AcidFadeCalculator,
} as const;

export interface FadeShare {
  percentage: number;
  ranking: number;
}

export const fadeShare = (name: string, paintSeed: number | null): FadeShare | null => {
  const match = NAME.exec(name);

  if (!match || paintSeed === null) return null;

  const calculator = CALCULATORS[match[2] as keyof typeof CALCULATORS];

  if (!calculator || !calculator.getSupportedWeapons().includes(match[1])) return null;

  const { percentage, ranking } = calculator.getFadePercentage(match[1], paintSeed);

  return { percentage: Math.round(percentage * 10) / 10, ranking };
};

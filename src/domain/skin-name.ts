const WEAR_SUFFIX = / \((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/;

export const skinBaseName = (marketHashName: string): string =>
  marketHashName
    .replace(WEAR_SUFFIX, '')
    .replace('StatTrak™ ', '')
    .replace(/^Souvenir /, '');

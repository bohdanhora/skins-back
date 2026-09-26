import { decodeHex } from '@csfloat/cs2-inspect-serializer';

import { phaseFromPaintIndex, type MarketPhase } from '../../domain/market-variant';

export interface RawAssetProperty {
  propertyid: number;
  int_value?: string;
  float_value?: number | string;
  string_value?: string;
}

export interface AssetTraits {
  float: number | null;
  paintSeed: number | null;
  phase: MarketPhase | null;
}

const PAINT_SEED = 1;
const WEAR = 2;
const CERTIFICATE = 6;

export const readAssetTraits = (properties: RawAssetProperty[] = []): AssetTraits => {
  const find = (id: number) => properties.find((property) => property.propertyid === id);
  const wear = find(WEAR)?.float_value;
  const paintSeed = find(PAINT_SEED)?.int_value;
  const certificate = find(CERTIFICATE)?.string_value;
  let phase: MarketPhase | null = null;

  if (certificate) {
    try {
      phase = phaseFromPaintIndex(decodeHex(certificate).paintindex ?? 0);
    } catch {
      phase = null;
    }
  }

  return {
    float: wear !== undefined && Number.isFinite(Number(wear)) ? Number(wear) : null,
    paintSeed: paintSeed ? Number(paintSeed) : null,
    phase,
  };
};

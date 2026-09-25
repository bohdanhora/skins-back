import { toStickerItemName } from './listing';

export interface PricedSticker {
  name: string;
  /** What this sticker costs on its own, cents, or null when nobody sells it. */
  price: number | null;
}

export interface StickerDeal {
  /** The same skin without anything special: its cheapest listing, cents. */
  basePrice: number | null;
  /** What you pay above that for this exact listing, cents. Can be zero or negative. */
  overpay: number | null;
  /** Price of the stickers you searched for, counted on this listing, cents. */
  wantedValue: number;
  /**
   * Overpay as a share of the wanted stickers' price. 0.1 means you pay 10% of
   * what the stickers cost on their own. Lower is better.
   */
  overpayShare: number | null;
}

const normalize = (name: string): string => toStickerItemName(name).toLowerCase();

export const evaluateStickerDeal = (
  price: number,
  basePrice: number | null,
  stickers: PricedSticker[],
  wanted: string[],
): StickerDeal => {
  const wantedNames = new Set(wanted.map(normalize));
  const wantedValue = stickers
    .filter((sticker) => wantedNames.has(normalize(sticker.name)))
    .reduce((sum, sticker) => sum + (sticker.price ?? 0), 0);
  const overpay = basePrice === null ? null : price - basePrice;

  return {
    basePrice,
    overpay,
    wantedValue,
    overpayShare:
      overpay === null || wantedValue <= 0
        ? null
        : Math.round((Math.max(0, overpay) / wantedValue) * 1000) / 1000,
  };
};

/** Nearly free stickers first; among equals, the cheaper listing. */
export const compareStickerDeals = (
  left: StickerDeal & { price: number },
  right: StickerDeal & { price: number },
): number => {
  if (left.overpayShare === null || right.overpayShare === null) {
    return left.overpayShare === null
      ? right.overpayShare === null
        ? left.price - right.price
        : 1
      : -1;
  }

  return left.overpayShare - right.overpayShare || left.price - right.price;
};

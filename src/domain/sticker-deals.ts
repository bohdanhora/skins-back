import { toStickerItemName } from './listing';

export interface PricedSticker {
  name: string;
  price: number | null;
}

export interface StickerDeal {
  basePrice: number | null;
  overpay: number | null;
  wantedValue: number;
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

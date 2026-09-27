import { type PreviewData } from './inspect-gen';
import { type MarketId } from './market-links';

export interface AppliedSticker {
  name: string;
  image: string | null;
  slot: number | null;
  wear: number | null;
  offsetX: number | null;
  offsetY: number | null;
  rotation: number | null;
  scale: number | null;
}

export interface Listing {
  market: MarketId;
  id: string;
  name: string;
  image: string | null;
  price: number;
  float: string | null;
  paintSeed: number | null;
  stickers: AppliedSticker[];
  url: string;
}

const STICKER_PREFIX = 'Sticker | ';

export const toStickerItemName = (name: string): string =>
  name.startsWith(STICKER_PREFIX) ? name : `${STICKER_PREFIX}${name}`;

export const withoutStickerPrefix = (name: string): string =>
  name.startsWith(STICKER_PREFIX) ? name.slice(STICKER_PREFIX.length) : name;

export const dollarsToCents = (value: string | number): number => Math.round(Number(value) * 100);

export const toStickerWear = (value: string | number | null | undefined): number | null => {
  const wear = Number(value);

  return value === null ||
    value === undefined ||
    value === '' ||
    !Number.isFinite(wear) ||
    wear <= 0
    ? null
    : Math.min(1, wear);
};

export const toStickerNumber = (value: string | number | null | undefined): number | null => {
  const number = Number(value);

  return value === null ||
    value === undefined ||
    value === '' ||
    !Number.isFinite(number) ||
    number === 0
    ? null
    : number;
};

export const bySlot = (left: AppliedSticker, right: AppliedSticker): number =>
  (left.slot ?? Number.MAX_SAFE_INTEGER) - (right.slot ?? Number.MAX_SAFE_INTEGER);

export const placeFromPreview = (
  stickers: AppliedSticker[],
  preview: PreviewData | null,
  ids?: (number | null)[],
): AppliedSticker[] => {
  if (!preview || (!ids && preview.stickers.length !== stickers.length)) return stickers;

  const unused = [...preview.stickers];

  return stickers
    .map((sticker, index) => {
      const id = ids?.[index];
      const at = id ? unused.findIndex((placed) => placed.stickerId === id) : 0;
      const placed = at >= 0 ? unused.splice(at, 1)[0] : undefined;

      return placed
        ? {
            ...sticker,
            slot: placed.slot,
            wear: toStickerWear(placed.wear),
            offsetX: toStickerNumber(placed.offsetX),
            offsetY: toStickerNumber(placed.offsetY),
            rotation: toStickerNumber(placed.rotation),
            scale: toStickerNumber(placed.scale),
          }
        : sticker;
    })
    .sort(bySlot);
};

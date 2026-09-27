import { type MarketId } from './market-links';

export interface AppliedSticker {
  name: string;
  image: string | null;
  slot: number | null;
  wear: number | null;
  offsetX: number | null;
  offsetY: number | null;
  rotation: number | null;
}

export interface Listing {
  market: MarketId;
  id: string;
  name: string;
  image: string | null;
  price: number;
  float: string | null;
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

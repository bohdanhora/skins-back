import { type MarketId } from './market-links';

export interface AppliedSticker {
  name: string;
  image: string | null;
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

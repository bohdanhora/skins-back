export enum MarketId {
  WhiteMarket = 'whiteMarket',
  Dmarket = 'dmarket',
  Csfloat = 'csfloat',
}

export const whiteMarketItemUrl = (name: string): string =>
  `https://white.market/item?appId=730&nameHash=${encodeURIComponent(name)}`;

export const whiteMarketListingUrl = (slug: string): string =>
  `https://white.market/item/${encodeURIComponent(slug)}`;

export const dmarketItemUrl = (name: string): string =>
  `https://dmarket.com/ingame-items/item-list/csgo-skins?title=${encodeURIComponent(name)}`;

export const csfloatItemUrl = (name: string): string =>
  `https://csfloat.com/search?market_hash_name=${encodeURIComponent(name)}`;

const FLOAT_WINDOW = 0.000001;

export const dmarketListingUrl = (name: string, float: number | string | null): string => {
  const value = Number(float);

  if (float === null || float === '' || !Number.isFinite(value)) {
    return dmarketItemUrl(name);
  }

  const from = Math.max(0, value - FLOAT_WINDOW).toFixed(7);
  const to = Math.min(1, value + FLOAT_WINDOW).toFixed(7);

  return `${dmarketItemUrl(name)}&floatValueFrom=${from}&floatValueTo=${to}`;
};

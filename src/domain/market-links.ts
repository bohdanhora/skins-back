export enum MarketId {
  WhiteMarket = 'whiteMarket',
  Dmarket = 'dmarket',
}

export const whiteMarketItemUrl = (name: string): string =>
  `https://white.market/item?appId=730&nameHash=${encodeURIComponent(name)}`;

/** Every white.market listing has its own page, addressed by the product slug. */
export const whiteMarketListingUrl = (slug: string): string =>
  `https://white.market/item/${encodeURIComponent(slug)}`;

export const dmarketItemUrl = (name: string): string =>
  `https://dmarket.com/ingame-items/item-list/csgo-skins?title=${encodeURIComponent(name)}`;

/** Half-width of the float window: floats are unique per item, so this leaves exactly one listing. */
const FLOAT_WINDOW = 0.000001;

/**
 * DMarket has no link to a single offer, but its list filters by float in the
 * address, so a tiny window around the exact float opens just that listing.
 */
export const dmarketListingUrl = (name: string, float: number | string | null): string => {
  const value = Number(float);

  if (float === null || float === '' || !Number.isFinite(value)) {
    return dmarketItemUrl(name);
  }

  const from = Math.max(0, value - FLOAT_WINDOW).toFixed(7);
  const to = Math.min(1, value + FLOAT_WINDOW).toFixed(7);

  return `${dmarketItemUrl(name)}&floatValueFrom=${from}&floatValueTo=${to}`;
};

export enum MarketId {
  WhiteMarket = 'whiteMarket',
  Dmarket = 'dmarket',
}

export const whiteMarketItemUrl = (name: string): string =>
  `https://white.market/item?appId=730&nameHash=${encodeURIComponent(name)}`;

export const dmarketItemUrl = (name: string): string =>
  `https://dmarket.com/ingame-items/item-list/csgo-skins?title=${encodeURIComponent(name)}`;

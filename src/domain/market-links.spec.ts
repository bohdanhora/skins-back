import { dmarketItemUrl, dmarketListingUrl } from './market-links';

describe('dmarketListingUrl', () => {
  it('narrows the DMarket list to the exact float of one listing', () => {
    expect(dmarketListingUrl('AK-47 | Crane Flight (Field-Tested)', 0.18400108814239502)).toBe(
      'https://dmarket.com/ingame-items/item-list/csgo-skins?title=AK-47%20%7C%20Crane%20Flight%20(Field-Tested)&floatValueFrom=0.1840001&floatValueTo=0.1840021',
    );
  });

  it('falls back to the item page without a float', () => {
    expect(dmarketListingUrl('Revolution Case', null)).toBe(dmarketItemUrl('Revolution Case'));
  });
});

import { compareStickerDeals, evaluateStickerDeal } from './sticker-deals';

const navi = { name: 'Sticker | Natus Vincere | Katowice 2019', price: 136 };
const liquid = { name: 'Team Liquid | Katowice 2019', price: 329 };
const cheap = { name: 'Sticker | FURIA | 2020 RMR', price: 3 };

describe('evaluateStickerDeal', () => {
  it('measures the overpay against the base skin and the wanted stickers only', () => {
    expect(
      evaluateStickerDeal(48, 40, [liquid, navi, cheap], ['Natus Vincere | Katowice 2019']),
    ).toEqual({
      basePrice: 40,
      overpay: 8,
      wantedValue: 136,
      overpayShare: 0.059,
    });
  });

  it('counts a sticker applied twice twice', () => {
    expect(evaluateStickerDeal(70, 60, [navi, navi], [navi.name]).wantedValue).toBe(272);
  });

  it('treats a listing cheaper than the base as a free sticker', () => {
    expect(evaluateStickerDeal(35, 40, [navi], [navi.name])).toMatchObject({
      overpay: -5,
      overpayShare: 0,
    });
  });

  it('has no share without a base price or a priced sticker', () => {
    expect(evaluateStickerDeal(35, null, [navi], [navi.name]).overpayShare).toBeNull();
    expect(
      evaluateStickerDeal(35, 30, [{ name: navi.name, price: null }], [navi.name]).overpayShare,
    ).toBeNull();
  });
});

describe('compareStickerDeals', () => {
  it('puts nearly free stickers first and unknown ones last', () => {
    const deals = [
      { price: 90, ...evaluateStickerDeal(90, 40, [navi], [navi.name]) },
      { price: 50, ...evaluateStickerDeal(50, null, [navi], [navi.name]) },
      { price: 45, ...evaluateStickerDeal(45, 40, [navi], [navi.name]) },
    ].sort(compareStickerDeals);

    expect(deals.map((deal) => deal.price)).toEqual([45, 90, 50]);
  });
});

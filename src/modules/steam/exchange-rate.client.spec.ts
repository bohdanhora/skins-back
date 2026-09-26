import { parseSteamAmount, steamPriceToUsdCents } from './exchange-rate.client';

describe('Steam prices in dollars', () => {
  it('reads Steam amounts in any separator style', () => {
    expect(parseSteamAmount('UAH 1,225.00')).toBe(1225);
    expect(parseSteamAmount('1 225,50₴')).toBe(1225.5);
    expect(parseSteamAmount('₴ 7.225,50')).toBe(7225.5);
    expect(parseSteamAmount('$12.34')).toBe(12.34);
    expect(parseSteamAmount('₴')).toBeNull();
  });

  it('converts hryvnias with the bank rate', () => {
    expect(steamPriceToUsdCents('UAH 1,225.00', 40)).toBe(3063);
    expect(steamPriceToUsdCents('$12.34', null)).toBe(1234);
    expect(steamPriceToUsdCents('UAH 100.00', null)).toBeNull();
  });
});

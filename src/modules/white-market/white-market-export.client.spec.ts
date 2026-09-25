import { mapWhiteMarketPrices, type RawExportRow } from './white-market-export.client';

const row = (phase: string, price: string): RawExportRow => ({
  market_hash_name: '★ Karambit | Doppler (Factory New)',
  price,
  market_product_link: `https://white.market/item?csgoPhase=${phase}`,
  market_product_count: 2,
  cheapest_float: '0.02',
});

describe('white.market Doppler prices', () => {
  it('keeps rare phases separate and compares DMarket only with ordinary phases', () => {
    const prices = mapWhiteMarketPrices([
      row('SAPPHIRE', '7000'),
      row('PHASE1', '1000'),
      row('PHASE2', '900'),
      row('RUBY', '6000'),
    ]);

    expect(prices.get('★ Karambit | Doppler (Factory New)')?.price).toBe(90_000);
    expect(prices.get('★ Karambit | Doppler (Factory New) [Sapphire]')?.price).toBe(700_000);
    expect(prices.get('★ Karambit | Doppler (Factory New) [Ruby]')?.price).toBe(600_000);
  });
});

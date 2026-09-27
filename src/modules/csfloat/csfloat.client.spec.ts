import { type RawCsfloatListing, toBuyOrder, unwrapCsfloatListings } from './csfloat.client';

const listing = { id: '1' } as RawCsfloatListing;

describe('CSFloat listings response', () => {
  it('reads the current paginated response', () => {
    expect(unwrapCsfloatListings({ data: [listing], cursor: 'next' })).toEqual([listing]);
  });

  it('keeps compatibility with the documented array response', () => {
    expect(unwrapCsfloatListings([listing])).toEqual([listing]);
  });
});

describe('CSFloat buy orders', () => {
  it('reads float ranges and patterns the order asks for', () => {
    expect(
      toBuyOrder({ price: 8860, qty: 2, hybrid_properties: { min_float: 0.15, max_float: 0.179 } }),
    ).toMatchObject({ market: 'csfloat', price: 8860, amount: 2, floatRanges: [[0.15, 0.179]] });
    expect(toBuyOrder({ price: 100, qty: 1, hybrid_properties: {} })).toMatchObject({
      floatRanges: [],
      paintSeed: null,
    });
    expect(
      toBuyOrder({ price: 100, qty: 1, hybrid_properties: { paint_seed: 661 } }),
    ).toMatchObject({ paintSeed: 661 });
  });

  it('skips orders with conditions it cannot check', () => {
    expect(toBuyOrder({ price: 100, qty: 1, expression: 'float < 0.01' })).toBeNull();
    expect(toBuyOrder({ price: 100, qty: 1, hybrid_properties: { stickers: [1] } })).toBeNull();
  });
});

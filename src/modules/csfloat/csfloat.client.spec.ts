import { type RawCsfloatListing, unwrapCsfloatListings } from './csfloat.client';

const listing = { id: '1' } as RawCsfloatListing;

describe('CSFloat listings response', () => {
  it('reads the current paginated response', () => {
    expect(unwrapCsfloatListings({ data: [listing], cursor: 'next' })).toEqual([listing]);
  });

  it('keeps compatibility with the documented array response', () => {
    expect(unwrapCsfloatListings([listing])).toEqual([listing]);
  });
});

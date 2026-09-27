import { searchCandidates, type SearchRow } from './assistant-search';

const row = (name: string, category: string, price: number | null, listings = 1): SearchRow => ({
  name,
  searchName: name.toLowerCase(),
  category,
  phase: null,
  price,
  listings,
});

const rows = [
  row('★ Karambit | Gamma Doppler (Factory New)', 'knife', 90_000, 50),
  row('★ Flip Knife | Gamma Doppler (Factory New)', 'knife', 30_000, 80),
  row('★ Sport Gloves | Vice (Field-Tested)', 'gloves', 60_000, 10),
  row('Glock-18 | Gamma Doppler (Factory New)', 'pistol', 2_000, 400),
  row('StatTrak™ ★ Karambit | Gamma Doppler (Minimal Wear)', 'knife', 70_000, 5),
  row('★ Bayonet | Gamma Doppler (Factory New)', 'knife', null, 0),
];

describe('assistant search candidates', () => {
  it('keeps only items that match every filter, most traded first', () => {
    expect(
      searchCandidates(rows, { q: 'gamma doppler', category: 'knife', wear: 'FN' }, 10).map(
        (entry) => entry.name,
      ),
    ).toEqual([
      '★ Flip Knife | Gamma Doppler (Factory New)',
      '★ Karambit | Gamma Doppler (Factory New)',
    ]);
  });

  it('filters by edition and price', () => {
    expect(
      searchCandidates(rows, { q: 'karambit', edition: 'stattrak', maxPrice: 800 }, 10).map(
        (entry) => entry.name,
      ),
    ).toEqual(['StatTrak™ ★ Karambit | Gamma Doppler (Minimal Wear)']);
  });

  it('caps the list', () => {
    expect(searchCandidates(rows, { q: 'gamma' }, 2)).toHaveLength(2);
  });
});

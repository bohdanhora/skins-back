export interface SearchRow {
  name: string;
  searchName: string;
  category: string;
  phase: string | null;
  price: number | null;
  listings: number;
}

export interface SearchFilters {
  q?: string;
  category?: string;
  wear?: string;
  edition?: string;
  phase?: string;
  minPrice?: number;
  maxPrice?: number;
}

const WEAR_NAMES: Record<string, string> = {
  FN: '(factory new)',
  MW: '(minimal wear)',
  FT: '(field-tested)',
  WW: '(well-worn)',
  BS: '(battle-scarred)',
};

const editionOf = (name: string): string =>
  name.includes('StatTrak™') ? 'stattrak' : name.startsWith('Souvenir ') ? 'souvenir' : 'normal';

export const searchCandidates = (
  rows: readonly SearchRow[],
  filters: SearchFilters,
  limit: number,
): SearchRow[] => {
  const words = (filters.q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const wear = filters.wear ? WEAR_NAMES[filters.wear] : undefined;

  return rows
    .filter((row) => {
      const name = row.searchName;

      if (!words.every((word) => name.includes(word))) return false;
      if (filters.category && row.category !== filters.category) return false;
      if (wear && !name.includes(wear)) return false;
      if (filters.edition && editionOf(row.name) !== filters.edition) return false;
      if (filters.phase && row.phase !== filters.phase) return false;
      if (row.price === null) return false;
      if (filters.minPrice !== undefined && row.price < filters.minPrice * 100) return false;
      if (filters.maxPrice !== undefined && row.price > filters.maxPrice * 100) return false;

      return true;
    })
    .sort((left, right) => right.listings - left.listings)
    .slice(0, limit);
};

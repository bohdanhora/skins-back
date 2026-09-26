import { ItemCategory } from '../../domain/categories';
import { cheapestPrice } from '../../domain/comparison';
import { parseVariantName } from '../../domain/market-variant';
import { type IndexedItem } from './item-index.service';
import { isPhaseSummary } from './item-query';
import { type ItemLibraryDto, type ItemLibraryQueryDto } from './dto/item-library.dto';

const LIBRARY_CATEGORIES = new Set([
  ItemCategory.Rifle,
  ItemCategory.Sniper,
  ItemCategory.Pistol,
  ItemCategory.Smg,
  ItemCategory.Heavy,
  ItemCategory.Knife,
  ItemCategory.Gloves,
]);

const WEAR_SUFFIX = / \((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/;

interface LibraryRow {
  item: IndexedItem;
  weapon: string;
  skin: string;
  price: number | null;
}

const priceOf = (item: IndexedItem): number | null => cheapestPrice(item);

const partsOf = (name: string): { weapon: string; skin: string } | null => {
  const { marketHashName } = parseVariantName(name);
  const base = marketHashName.replace(WEAR_SUFFIX, '');
  const clean = base
    .replace(/^★\s*/, '')
    .replace(/^StatTrak™\s*/, '')
    .replace(/^Souvenir\s*/, '')
    .replace(/^★\s*/, '');
  const separator = clean.indexOf(' | ');

  if (separator < 1) return null;

  return { weapon: clean.slice(0, separator), skin: clean.slice(separator + 3) };
};

const toRows = (items: readonly IndexedItem[]): LibraryRow[] =>
  items.flatMap((item) => {
    if (!LIBRARY_CATEGORIES.has(item.category) || isPhaseSummary(item)) return [];

    const parts = partsOf(item.name);

    return parts ? [{ item, ...parts, price: priceOf(item) }] : [];
  });

const optionList = (
  rows: LibraryRow[],
  valueOf: (row: LibraryRow) => string,
  sort: 'name' | 'price' = 'name',
): { value: string; image: string | null; count: number; price: number | null }[] => {
  const grouped = new Map<string, LibraryRow[]>();

  for (const row of rows) {
    const value = valueOf(row);
    grouped.set(value, [...(grouped.get(value) ?? []), row]);
  }

  return [...grouped]
    .map(([value, entries]) => ({
      value,
      image: entries.find((entry) => entry.item.image)?.item.image ?? null,
      count: new Set(entries.map((entry) => entry.item.name)).size,
      price: Math.min(...entries.map((entry) => entry.price ?? Infinity)),
    }))
    .map((option) => ({
      ...option,
      price: Number.isFinite(option.price) ? option.price : null,
    }))
    .sort((left, right) =>
      sort === 'price'
        ? (right.price ?? -Infinity) - (left.price ?? -Infinity) ||
          left.value.localeCompare(right.value)
        : left.value.localeCompare(right.value),
    );
};

export const buildItemLibrary = (
  items: readonly IndexedItem[],
  query: ItemLibraryQueryDto,
): ItemLibraryDto => {
  const rows = toRows(items);
  const categories = [...LIBRARY_CATEGORIES]
    .map((value) => ({
      value,
      count: rows.filter((row) => row.item.category === value).length,
    }))
    .filter((entry) => entry.count > 0);
  const categoryRows = query.category
    ? rows.filter((row) => row.item.category === query.category)
    : [];
  const weaponRows = query.weapon ? categoryRows.filter((row) => row.weapon === query.weapon) : [];
  const skinRows = query.skin ? weaponRows.filter((row) => row.skin === query.skin) : [];

  return {
    categories,
    weapons: optionList(categoryRows, (row) => row.weapon),
    skins: optionList(weaponRows, (row) => row.skin, 'price'),
    variants: skinRows
      .map((row) => ({
        name: row.item.name,
        image: row.item.image,
        price: row.price,
        phase: row.item.phase,
      }))
      .sort((left, right) => (left.price ?? Infinity) - (right.price ?? Infinity)),
  };
};

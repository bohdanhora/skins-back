import { median } from './blue-value';
import { impliedChances, type SeriesOutlook } from './cs-model';

export type MarketKind = 'winner' | 'map' | 'handicap' | 'total';

export interface MarketDef {
  id: number;
  kind: MarketKind;
  line: number;
  mapIndex: number | null;
}

const def = (
  id: number,
  kind: MarketKind,
  line = 0,
  mapIndex: number | null = null,
): MarketDef => ({
  id,
  kind,
  line,
  mapIndex,
});

export const CS_MARKETS: MarketDef[] = [
  def(171, 'winner'),
  def(173, 'total', 2.5),
  def(175, 'total', 3.5),
  def(177, 'total', 4.5),
  def(1717, 'handicap', -3.5),
  def(1721, 'handicap', -2.5),
  def(1725, 'handicap', -1.5),
  def(1729, 'handicap', -0.5),
  def(1733, 'handicap', 0.5),
  def(1737, 'handicap', 1.5),
  def(1741, 'handicap', 2.5),
  def(1745, 'handicap', 3.5),
  def(1747, 'map', 0, 1),
  def(1749, 'map', 0, 2),
  def(1751, 'map', 0, 3),
  def(1753, 'map', 0, 4),
  def(1755, 'map', 0, 5),
];

export type Side = 1 | 2;

export const outcomeId = (market: MarketDef, side: Side): number =>
  side === 1 ? market.id : market.id + 1;

export const modelChance = (
  market: MarketDef,
  side: Side,
  outlook: SeriesOutlook,
  mapChances: number[],
  bestOf: number,
): number | null => {
  let first: number | null = null;

  if (market.kind === 'winner') {
    first = outlook.win;
  } else if (market.kind === 'map') {
    first = market.mapIndex !== null ? (mapChances[market.mapIndex - 1] ?? null) : null;
  } else if (market.kind === 'handicap') {
    if (Math.abs(market.line) >= bestOf) return null;

    first = outlook.scores
      .filter((score) => score.first - score.second + market.line > 0)
      .reduce((sum, score) => sum + score.chance, 0);
  } else {
    if (market.line >= bestOf) return null;

    first = [...outlook.mapCount.entries()]
      .filter(([count]) => count > market.line)
      .reduce((sum, [, chance]) => sum + chance, 0);
  }

  if (first === null) return null;

  return side === 1 ? first : 1 - first;
};

export interface Quote {
  bookmaker: string;
  price: number;
}

export interface MarketQuotes {
  market: MarketDef;
  first: Quote[];
  second: Quote[];
}

interface RawPlayer {
  active?: boolean;
  price?: number;
}

interface RawBookmaker {
  bookmakerIsActive?: boolean;
  suspended?: boolean;
  markets?: Record<string, { outcomes?: Record<string, { players?: Record<string, RawPlayer> }> }>;
}

const priceOf = (book: RawBookmaker, market: number, outcome: number): number | null => {
  const player = book.markets?.[String(market)]?.outcomes?.[String(outcome)]?.players?.['0'];

  return player && player.active !== false && typeof player.price === 'number' && player.price > 1
    ? player.price
    : null;
};

export const collectQuotes = (
  bookmakers: Record<string, RawBookmaker>,
  swapped: boolean,
): MarketQuotes[] =>
  CS_MARKETS.map((market) => {
    const first: Quote[] = [];
    const second: Quote[] = [];

    for (const [bookmaker, book] of Object.entries(bookmakers)) {
      if (book.bookmakerIsActive === false || book.suspended) continue;

      const one = priceOf(book, market.id, outcomeId(market, 1));
      const two = priceOf(book, market.id, outcomeId(market, 2));
      const [own, other] = swapped && market.kind !== 'total' ? [two, one] : [one, two];

      if (own) first.push({ bookmaker, price: own });
      if (other) second.push({ bookmaker, price: other });
    }

    const flipped =
      swapped && market.kind === 'handicap'
        ? CS_MARKETS.find((entry) => entry.kind === 'handicap' && entry.line === -market.line)
        : undefined;

    return { market: flipped ?? market, first, second };
  }).filter((entry) => entry.first.length > 0 || entry.second.length > 0);

export const consensusChance = (quotes: MarketQuotes): number | null => {
  const byBook = new Map<string, [number?, number?]>();

  for (const quote of quotes.first) byBook.set(quote.bookmaker, [quote.price, undefined]);
  for (const quote of quotes.second) {
    const pair = byBook.get(quote.bookmaker);

    if (pair) pair[1] = quote.price;
  }

  const fair = [...byBook.values()]
    .filter((pair): pair is [number, number] => pair[0] !== undefined && pair[1] !== undefined)
    .map((pair) => impliedChances(pair)[0]);

  return median(fair);
};

export const bestQuote = (quotes: Quote[]): Quote | null =>
  quotes.reduce<Quote | null>(
    (top, quote) => (!top || quote.price > top.price ? quote : top),
    null,
  );

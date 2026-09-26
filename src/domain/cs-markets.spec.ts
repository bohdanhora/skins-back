import {
  CS_MARKETS,
  bestQuote,
  collectQuotes,
  consensusChance,
  modelChance,
  type MarketDef,
} from './cs-markets';
import { seriesOutlook } from './cs-model';

const market = (id: number): MarketDef => CS_MARKETS.find((entry) => entry.id === id)!;

const books = (entries: Record<string, [number, number, number]>) =>
  Object.fromEntries(
    Object.entries(entries).map(([name, [marketId, first, second]]) => [
      name,
      {
        bookmakerIsActive: true,
        suspended: false,
        markets: {
          [marketId]: {
            outcomes: {
              [marketId]: { players: { '0': { active: true, price: first } } },
              [marketId + 1]: { players: { '0': { active: true, price: second } } },
            },
          },
        },
      },
    ]),
  );

describe('cs markets', () => {
  const chances = [0.6, 0.6, 0.6];
  const outlook = seriesOutlook(chances);

  it('prices every market from the series outlook', () => {
    expect(modelChance(market(171), 1, outlook, chances, 3)).toBeCloseTo(0.648, 3);
    expect(modelChance(market(1725), 1, outlook, chances, 3)).toBeCloseTo(0.36);
    expect(modelChance(market(1737), 2, outlook, chances, 3)).toBeCloseTo(0.16);
    expect(modelChance(market(173), 1, outlook, chances, 3)).toBeCloseTo(0.48);
    expect(modelChance(market(1749), 2, outlook, chances, 3)).toBeCloseTo(0.4);
    expect(modelChance(market(175), 1, outlook, chances, 3)).toBeNull();
  });

  it('collects prices and turns them around when the teams are swapped', () => {
    const quotes = collectQuotes(books({ a: [1725, 3, 1.3], b: [171, 1.5, 2.6] }), true);
    const handicap = quotes.find((entry) => entry.market.kind === 'handicap')!;
    const winner = quotes.find((entry) => entry.market.id === 171)!;

    expect(handicap.market.line).toBe(1.5);
    expect(handicap.first).toEqual([{ bookmaker: 'a', price: 1.3 }]);
    expect(winner.first).toEqual([{ bookmaker: 'b', price: 2.6 }]);
  });

  it('removes the margin to find what the market believes', () => {
    const [winner] = collectQuotes(books({ a: [171, 1.8, 2], b: [171, 1.9, 1.9] }), false);

    expect(consensusChance(winner)).toBeCloseTo((0.5263 + 0.5) / 2, 3);
    expect(bestQuote(winner.first)).toEqual({ bookmaker: 'b', price: 1.9 });
  });
});

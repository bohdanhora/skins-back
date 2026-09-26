import {
  activeMapPool,
  buildRatings,
  expectedScore,
  impliedChances,
  mapWinChance,
  predictVeto,
  seriesOutlook,
  valueOf,
  type MapResult,
} from './cs-model';

const result = (team1: string, team2: string, map: string, winner: 1 | 2, day = 1): MapResult => ({
  playedAt: `2026-09-${String(day).padStart(2, '0')}T12:00:00Z`,
  team1,
  team2,
  map,
  winner,
});

const noPrior = () => null;

describe('cs model', () => {
  it('gives even odds to equal ratings', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5);
    expect(expectedScore(1700, 1500)).toBeGreaterThan(0.7);
  });

  it('learns map strengths from results', () => {
    const results = [
      ...Array.from({ length: 6 }, (_, index) => result('A', 'B', 'Nuke', 1, index + 1)),
      ...Array.from({ length: 6 }, (_, index) => result('A', 'B', 'Mirage', 2, index + 1)),
    ];
    const ratings = buildRatings(results, noPrior);

    expect(mapWinChance(ratings, 'A', 'B', 'Nuke', noPrior)).toBeGreaterThan(0.6);
    expect(mapWinChance(ratings, 'A', 'B', 'Mirage', noPrior)).toBeLessThan(0.4);
    expect(ratings.maps.get('A')?.get('Nuke')).toMatchObject({ games: 6, wins: 6 });
  });

  it('starts from the prior when a team has no history', () => {
    const prior = (team: string) => (team === 'Top' ? 1800 : 1400);
    const ratings = buildRatings([], prior);

    expect(mapWinChance(ratings, 'Top', 'Low', 'Nuke', prior)).toBeGreaterThan(0.85);
  });

  it('keeps the maps played recently', () => {
    const now = Date.parse('2026-09-30T00:00:00Z');
    const results = [result('A', 'B', 'Nuke', 1), result('A', 'B', 'Cache', 1)];

    results[1].playedAt = '2025-01-01T00:00:00Z';
    expect(activeMapPool(results, now)).toEqual(['Nuke']);
  });

  it('bans the worst map and picks the best one in a best of three', () => {
    const pool = ['Ancient', 'Anubis', 'Dust2', 'Inferno', 'Mirage', 'Nuke', 'Train'];
    const chances: Record<string, number> = {
      Ancient: 0.2,
      Anubis: 0.8,
      Dust2: 0.5,
      Inferno: 0.55,
      Mirage: 0.45,
      Nuke: 0.7,
      Train: 0.3,
    };
    const { maps, actions } = predictVeto(pool, 3, (map) => chances[map]);

    expect(actions[0]).toEqual({ team: 1, step: 'ban', map: 'Ancient' });
    expect(actions[1]).toEqual({ team: 2, step: 'ban', map: 'Anubis' });
    expect(maps.map((entry) => [entry.map, entry.pickedBy])).toEqual([
      ['Nuke', 1],
      ['Train', 2],
      ['Dust2', null],
    ]);
  });

  it('plays only the decider in a best of one', () => {
    const pool = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const { maps } = predictVeto(pool, 1, () => 0.5);

    expect(maps).toHaveLength(1);
    expect(maps[0].pickedBy).toBeNull();
  });

  it('adds up every series score', () => {
    const outlook = seriesOutlook([0.6, 0.6, 0.6]);
    const total = outlook.scores.reduce((sum, score) => sum + score.chance, 0);

    expect(total).toBeCloseTo(1);
    expect(outlook.win).toBeCloseTo(0.648, 3);
    expect(outlook.scores[0]).toMatchObject({ first: 2, second: 0 });
    expect(outlook.scores[0].chance).toBeCloseTo(0.36);
    expect(outlook.mapCount.get(3)).toBeCloseTo(0.48);
  });

  it('measures the edge of a bet', () => {
    const bet = valueOf({ market: 'Winner', selection: 'A', chance: 0.6, odds: 2, bookmaker: 'x' });

    expect(bet.expectedValue).toBeCloseTo(0.2);
    expect(bet.kelly).toBeCloseTo(0.2);
    expect(valueOf({ ...bet, chance: 0.4 }).kelly).toBe(0);
  });

  it('removes the bookmaker margin', () => {
    const [first, second] = impliedChances([1.8, 2]);

    expect(first + second).toBeCloseTo(1);
    expect(first).toBeGreaterThan(second);
  });
});

export interface MapResult {
  playedAt: string;
  team1: string;
  team2: string;
  map: string;
  winner: 1 | 2;
}

export interface TeamMapRating {
  offset: number;
  games: number;
  wins: number;
}

export interface Ratings {
  overall: Map<string, number>;
  maps: Map<string, Map<string, TeamMapRating>>;
  games: Map<string, number>;
}

export type Prior = (team: string) => number | null;

const BASE_RATING = 1400;
const OVERALL_K = 24;
const MAP_K = 14;
const ELO_SCALE = 400;

export const expectedScore = (rating: number, opponent: number): number =>
  1 / (1 + 10 ** ((opponent - rating) / ELO_SCALE));

export const priorFromPoints = (points: number): number => 1500 + (points - 1000) * 0.25;

const mapRating = (ratings: Ratings, team: string, map: string): TeamMapRating => {
  let byMap = ratings.maps.get(team);

  if (!byMap) {
    byMap = new Map();
    ratings.maps.set(team, byMap);
  }

  let entry = byMap.get(map);

  if (!entry) {
    entry = { offset: 0, games: 0, wins: 0 };
    byMap.set(map, entry);
  }

  return entry;
};

export const teamRating = (ratings: Ratings, team: string, prior: Prior): number =>
  ratings.overall.get(team) ?? prior(team) ?? BASE_RATING;

export const buildRatings = (results: MapResult[], prior: Prior): Ratings => {
  const ratings: Ratings = { overall: new Map(), maps: new Map(), games: new Map() };
  const ordered = [...results].sort(
    (left, right) => Date.parse(left.playedAt) - Date.parse(right.playedAt),
  );

  for (const result of ordered) {
    const first = teamRating(ratings, result.team1, prior);
    const second = teamRating(ratings, result.team2, prior);
    const firstMap = mapRating(ratings, result.team1, result.map);
    const secondMap = mapRating(ratings, result.team2, result.map);
    const expected = expectedScore(first + firstMap.offset, second + secondMap.offset);
    const actual = result.winner === 1 ? 1 : 0;
    const surprise = actual - expected;

    ratings.overall.set(result.team1, first + OVERALL_K * surprise);
    ratings.overall.set(result.team2, second - OVERALL_K * surprise);
    firstMap.offset += MAP_K * surprise;
    secondMap.offset -= MAP_K * surprise;
    firstMap.games += 1;
    secondMap.games += 1;
    firstMap.wins += actual;
    secondMap.wins += 1 - actual;
    ratings.games.set(result.team1, (ratings.games.get(result.team1) ?? 0) + 1);
    ratings.games.set(result.team2, (ratings.games.get(result.team2) ?? 0) + 1);
  }

  return ratings;
};

export const mapWinChance = (
  ratings: Ratings,
  team: string,
  opponent: string,
  map: string,
  prior: Prior,
): number => {
  const own = teamRating(ratings, team, prior) + (ratings.maps.get(team)?.get(map)?.offset ?? 0);
  const other =
    teamRating(ratings, opponent, prior) + (ratings.maps.get(opponent)?.get(map)?.offset ?? 0);

  return expectedScore(own, other);
};

export const activeMapPool = (results: MapResult[], now: number, days = 90, size = 7): string[] => {
  const since = now - days * 86_400_000;
  const counts = new Map<string, number>();

  for (const result of results) {
    if (Date.parse(result.playedAt) >= since) {
      counts.set(result.map, (counts.get(result.map) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, size)
    .map(([map]) => map)
    .sort();
};

export type VetoStep = 'ban' | 'pick';

const VETO_ORDERS: Record<1 | 3 | 5, VetoStep[]> = {
  1: ['ban', 'ban', 'ban', 'ban', 'ban', 'ban'],
  3: ['ban', 'ban', 'pick', 'pick', 'ban', 'ban'],
  5: ['ban', 'ban', 'pick', 'pick', 'pick', 'pick'],
};

export interface PlannedMap {
  map: string;
  pickedBy: 1 | 2 | null;
  chance: number;
}

export interface VetoAction {
  team: 1 | 2;
  step: VetoStep;
  map: string;
}

export const predictVeto = (
  pool: string[],
  bestOf: 1 | 3 | 5,
  chance: (map: string) => number,
): { maps: PlannedMap[]; actions: VetoAction[] } => {
  const remaining = [...pool];
  const maps: PlannedMap[] = [];
  const actions: VetoAction[] = [];

  VETO_ORDERS[bestOf].forEach((step, index) => {
    if (remaining.length <= 1) return;

    const team: 1 | 2 = index % 2 === 0 ? 1 : 2;
    const own = (map: string) => (team === 1 ? chance(map) : 1 - chance(map));
    const ranked = [...remaining].sort((left, right) => own(left) - own(right));
    const map = step === 'ban' ? ranked[0] : ranked[ranked.length - 1];

    remaining.splice(remaining.indexOf(map), 1);
    actions.push({ team, step, map });

    if (step === 'pick') {
      maps.push({ map, pickedBy: team, chance: chance(map) });
    }
  });

  if (remaining.length > 0) {
    maps.push({ map: remaining[0], pickedBy: null, chance: chance(remaining[0]) });
  }

  return { maps: maps.slice(0, bestOf), actions };
};

export interface SeriesOutlook {
  win: number;
  scores: { first: number; second: number; chance: number }[];
  mapCount: Map<number, number>;
}

export const seriesOutlook = (chances: number[]): SeriesOutlook => {
  const needed = Math.floor(chances.length / 2) + 1;
  const scores = new Map<string, number>();
  const mapCount = new Map<number, number>();

  const walk = (index: number, first: number, second: number, probability: number) => {
    if (first === needed || second === needed) {
      const key = `${first}:${second}`;

      scores.set(key, (scores.get(key) ?? 0) + probability);
      mapCount.set(index, (mapCount.get(index) ?? 0) + probability);
      return;
    }

    walk(index + 1, first + 1, second, probability * chances[index]);
    walk(index + 1, first, second + 1, probability * (1 - chances[index]));
  };

  walk(0, 0, 0, 1);

  const list = [...scores.entries()]
    .map(([key, chance]) => {
      const [first, second] = key.split(':').map(Number);

      return { first, second, chance };
    })
    .sort((left, right) => right.first - right.second - (left.first - left.second));

  return {
    win: list.filter((score) => score.first > score.second).reduce((sum, s) => sum + s.chance, 0),
    scores: list,
    mapCount,
  };
};

export interface BetOffer {
  market: string;
  selection: string;
  chance: number;
  odds: number;
  bookmaker: string;
}

export interface BetValue extends BetOffer {
  expectedValue: number;
  kelly: number;
}

export const valueOf = (offer: BetOffer): BetValue => {
  const expectedValue = offer.chance * offer.odds - 1;
  const kelly = offer.odds > 1 ? Math.max(0, expectedValue / (offer.odds - 1)) : 0;

  return { ...offer, expectedValue, kelly };
};

export const impliedChances = (odds: number[]): number[] => {
  const raw = odds.map((price) => 1 / price);
  const total = raw.reduce((sum, value) => sum + value, 0);

  return raw.map((value) => value / total);
};

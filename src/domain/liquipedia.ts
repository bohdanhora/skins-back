export interface ParsedMap {
  map: string;
  score1: number;
  score2: number;
  winner: 1 | 2;
}

export interface ParsedMatch {
  playedAt: string;
  team1: string;
  team2: string;
  bestOf: number | null;
  maps: ParsedMap[];
}

const POPUP = 'brkts-popup brkts-popup-container';
const ROW = 'brkts-popup-body-grid-row"';
const MAP_NAMES: Record<string, string> = { 'Dust II': 'Dust2' };

const decode = (value: string): string =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();

const parseRow = (row: string): ParsedMap | null => {
  const labels = [...row.matchAll(/data-label-type="result-(win|loss|draw)"/g)].map(
    (match) => match[1],
  );
  const scores = [...row.matchAll(/detailed-scores-main-score">(\d+)</g)].map((match) =>
    Number(match[1]),
  );
  const map = row.match(/class="brkts-popup-spaced"><a [^>]*title="([^"]+)"/)?.[1];

  if (!map || scores.length < 2) return null;

  const [score1, score2] = scores;
  const winner: 1 | 2 | null =
    labels[0] === 'win'
      ? 1
      : labels[1] === 'win'
        ? 2
        : score1 === score2
          ? null
          : score1 > score2
            ? 1
            : 2;

  if (winner === null) return null;

  const name = decode(map);

  return { map: MAP_NAMES[name] ?? name, score1, score2, winner };
};

export const parseMatches = (html: string): ParsedMatch[] =>
  html
    .split(POPUP)
    .slice(1)
    .flatMap((segment): ParsedMatch[] => {
      const timestamp = segment.match(/data-timestamp="(\d+)"/)?.[1];

      if (!timestamp || !segment.includes('data-finished="finished"')) return [];

      const bodyStart = segment.indexOf('brkts-popup-body');
      const header = bodyStart === -1 ? segment : segment.slice(0, bodyStart);
      const teams = [...header.matchAll(/data-team-name="([^"]+)"/g)].map((match) =>
        decode(match[1]),
      );

      if (teams.length < 2 || teams[0] === teams[1]) return [];

      const maps = segment
        .split(ROW)
        .slice(1)
        .map(parseRow)
        .filter((entry): entry is ParsedMap => entry !== null);

      if (maps.length === 0) return [];

      const bestOf = header.match(/\(Bo(\d)\)/)?.[1];

      return [
        {
          playedAt: new Date(Number(timestamp) * 1000).toISOString(),
          team1: teams[0],
          team2: teams[1],
          bestOf: bestOf ? Number(bestOf) : null,
          maps,
        },
      ];
    });

export const subpageLinks = (html: string, path: string): string[] => {
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`href="/counterstrike/(${escaped}/[^"#?]+)[#?"]`, 'g');

  return [...new Set([...html.matchAll(pattern)].map((match) => decodeURIComponent(match[1])))];
};

export const tournamentLinks = (html: string, fromYear: number, toYear: number): string[] => {
  const links = [...html.matchAll(/<a href="\/counterstrike\/([^"#?]+)" title="[^"]+"/g)]
    .map((match) => decodeURIComponent(match[1]))
    .filter((path) => {
      const year = Number(path.match(/\/(20\d\d)(\/|$)/)?.[1]);

      return year >= fromYear && year <= toYear && path.split('/').length <= 4;
    });

  return [...new Set(links)];
};

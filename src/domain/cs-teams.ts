const FILLER = new Set(['team', 'esports', 'esport', 'gaming', 'club', 'clan', 'gg', 'the']);

const ALIASES: Record<string, string> = {
  navi: 'natusvincere',
  nip: 'ninjasinpyjamas',
  vp: 'virtuspro',
  ence: 'ence',
  big: 'big',
  mongolz: 'mongolz',
};

export const teamKey = (name: string): string => {
  const words = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const meaningful = words.filter((word) => !FILLER.has(word));
  const key = (meaningful.length > 0 ? meaningful : words).join('');

  return ALIASES[key] ?? key;
};

export interface VrsTeam {
  rank: number;
  points: number;
  name: string;
  roster: string[];
}

export const parseVrsStandings = (markdown: string): VrsTeam[] =>
  markdown.split('\n').flatMap((line): VrsTeam[] => {
    const cells = line.split('|').map((cell) => cell.trim());
    const rank = Number(cells[1]);
    const points = Number(cells[2]);

    if (!Number.isInteger(rank) || rank <= 0 || !Number.isFinite(points) || !cells[3]) {
      return [];
    }

    return [
      {
        rank,
        points,
        name: cells[3],
        roster: (cells[4] ?? '')
          .split(',')
          .map((player) => player.trim())
          .filter(Boolean),
      },
    ];
  });

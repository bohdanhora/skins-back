import { parseMatches, subpageLinks, tournamentLinks } from './liquipedia';

const team = (name: string) =>
  `<div class="block-team"><div class="team-name-dynamic" data-team-shortname="x" data-team-bracketname="${name}" data-team-name="${name}"></div></div>`;

const row = (first: 'win' | 'loss', map: string, score1: number, score2: number) =>
  `<div class="brkts-popup-body-grid-row"><div class="generic-label" data-label-type="result-${first}"></div><div class="brkts-popup-body-grid-row-detail"><div class="brkts-popup-spaced"><div class="brkts-popup-body-detailed-scores-container"><div class="brkts-popup-body-detailed-scores-main-score">${score1}</div></div></div><div class="brkts-popup-spaced"><a href="/counterstrike/${map}" class="mw-redirect" title="${map}">${map}</a></div><div class="brkts-popup-spaced"><div class="brkts-popup-body-detailed-scores-container"><div class="brkts-popup-body-detailed-scores-main-score">${score2}</div></div></div></div><div class="generic-label" data-label-type="result-${first === 'win' ? 'loss' : 'win'}"></div></div>`;

const popup = (finished: boolean, rows: string) =>
  `<div class="brkts-popup brkts-popup-container brkts-match-info-popup"><span class="timer-object" data-timestamp="1781876700" ${finished ? 'data-finished="finished"' : ''}></span><div class="match-info-header">${team('Team Spirit')}<span class="match-info-header-scoreholder-lower">(Bo3)</span>${team('G2 Esports')}</div><div class="brkts-popup-body">${rows}</div></div>`;

describe('liquipedia', () => {
  it('reads finished matches with their maps', () => {
    const html =
      popup(true, row('loss', 'Overpass', 9, 13) + row('win', 'Dust II', 16, 14)) +
      popup(false, row('win', 'Nuke', 13, 2));

    expect(parseMatches(html)).toEqual([
      {
        playedAt: '2026-06-19T13:45:00.000Z',
        team1: 'Team Spirit',
        team2: 'G2 Esports',
        bestOf: 3,
        maps: [
          { map: 'Overpass', score1: 9, score2: 13, winner: 2 },
          { map: 'Dust2', score1: 16, score2: 14, winner: 1 },
        ],
      },
    ]);
  });

  it('finds the stage pages of a tournament', () => {
    const html =
      '<a href="/counterstrike/IEM/2026/Cologne/Stage_1">x</a><a href="/counterstrike/IEM/2026/Cologne/Playoffs#x">y</a><a href="/counterstrike/Other">z</a>';

    expect(subpageLinks(html, 'IEM/2026/Cologne')).toEqual([
      'IEM/2026/Cologne/Stage_1',
      'IEM/2026/Cologne/Playoffs',
    ]);
  });

  it('keeps recent tournaments from a tier list', () => {
    const html =
      '<a href="/counterstrike/PGL/2026/Singapore" title="a">a</a><a href="/counterstrike/PGL/2024/Old" title="b">b</a><a href="/counterstrike/PGL/2027/Next" title="d">d</a><a href="/counterstrike/Team_Spirit" title="c">c</a>';

    expect(tournamentLinks(html, 2025, 2026)).toEqual(['PGL/2026/Singapore']);
  });
});

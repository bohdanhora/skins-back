import { parseVrsStandings, teamKey } from './cs-teams';

describe('cs teams', () => {
  it('matches the same team across sources', () => {
    expect(teamKey('Team Spirit')).toBe(teamKey('Spirit'));
    expect(teamKey('G2 Esports')).toBe(teamKey('G2'));
    expect(teamKey('FaZe Clan')).toBe(teamKey('FaZe'));
    expect(teamKey('NAVI')).toBe(teamKey('Natus Vincere'));
    expect(teamKey('Ninjas in Pyjamas')).toBe(teamKey('NIP'));
    expect(teamKey('The MongolZ')).toBe(teamKey('MongolZ'));
    expect(teamKey('Virtus.pro')).toBe('virtuspro');
    expect(teamKey('BetBoom Team')).toBe(teamKey('BETBOOM'));
  });

  it('keeps names made only of filler words', () => {
    expect(teamKey('Team')).toBe('team');
  });

  it('reads the Valve standings table', () => {
    const markdown = [
      '| Standing | Points | Team Name | Roster | |',
      '| :- | -: | :- | :- | :- |',
      '| 1        |   2031 | Spirit               | donk, magixx, sh1ro, tN1R, zont1x | [details](x) |',
      '| 2        |   1902 | MOUZ                 | PR, Spinx | [details](y) |',
    ].join('\n');

    expect(parseVrsStandings(markdown)).toEqual([
      {
        rank: 1,
        points: 2031,
        name: 'Spirit',
        roster: ['donk', 'magixx', 'sh1ro', 'tN1R', 'zont1x'],
      },
      { rank: 2, points: 1902, name: 'MOUZ', roster: ['PR', 'Spinx'] },
    ]);
  });
});

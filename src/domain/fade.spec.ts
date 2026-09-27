import { fadeShare } from './fade';

describe('fadeShare', () => {
  it('reads the fade of a knife from its pattern', () => {
    expect(fadeShare('★ Karambit | Fade (Factory New)', 412)).toEqual({
      percentage: 100,
      ranking: 1,
    });
  });

  it('works for StatTrak guns and ignores other finishes', () => {
    expect(fadeShare('StatTrak™ Glock-18 | Fade (Factory New)', 412)?.percentage).toBeGreaterThan(
      0,
    );
    expect(fadeShare('★ Karambit | Marble Fade (Factory New)', 412)).toBeNull();
    expect(fadeShare('★ Karambit | Fade (Factory New)', null)).toBeNull();
  });
});

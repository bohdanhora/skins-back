import {
  blueGemPoses,
  blueShare,
  bluestSeeds,
  caseHardenedWeapon,
  CASE_HARDENED_WEAPONS,
} from './blue-gem';

describe('blue gem', () => {
  it('finds the weapon behind any Case Hardened market name', () => {
    expect(caseHardenedWeapon('AK-47 | Case Hardened (Field-Tested)')).toBe('AK-47');
    expect(caseHardenedWeapon('StatTrak™ AK-47 | Case Hardened (Minimal Wear)')).toBe('AK-47');
    expect(caseHardenedWeapon('★ StatTrak™ Karambit | Case Hardened (Battle-Scarred)')).toBe(
      'Karambit',
    );
    expect(caseHardenedWeapon('★ Karambit | Doppler (Factory New)')).toBeNull();
    expect(caseHardenedWeapon('Desert Eagle | Heat Treated (Field-Tested)')).toBeNull();
  });

  it('reads the blue share of both sides for a pattern', () => {
    expect(blueShare('AK-47 | Case Hardened (Field-Tested)', 661)).toEqual({
      playside: 97.64,
      backside: 19.22,
    });
    expect(blueShare('★ Karambit | Case Hardened (Minimal Wear)', 387)?.playside).toBe(97.7);
    expect(blueShare('AK-47 | Case Hardened (Field-Tested)', null)).toBeNull();
    expect(blueShare('AK-47 | Case Hardened (Field-Tested)', 1001)).toBeNull();
    expect(blueShare('AK-47 | Redline (Field-Tested)', 661)).toBeNull();
  });

  it('points to renders of every side the data covers', () => {
    expect(
      blueGemPoses('★ Karambit | Case Hardened (Field-Tested)').map((entry) => entry.pose),
    ).toEqual(['playside', 'backside']);
    expect(blueGemPoses('AK-47 | Case Hardened').map((entry) => entry.pose)).toEqual([
      'playside',
      'frontview',
    ]);
    expect(blueGemPoses('★ Falchion Knife | Case Hardened')).toHaveLength(1);
    expect(blueGemPoses('AK-47 | Redline')).toEqual([]);
    expect(blueGemPoses('★ Karambit | Case Hardened')[1].base).toBe(
      'https://cdn.csgoskins.gg/public/images/gems/v2/poses/karambit_ch_backside_',
    );
  });

  it('ranks the bluest patterns first', () => {
    const [first] = bluestSeeds('AK-47', 5);

    expect(bluestSeeds('AK-47', 5)).toHaveLength(5);
    expect(blueShare('AK-47 | Case Hardened (Field-Tested)', first)!.playside).toBeGreaterThan(95);
    expect(CASE_HARDENED_WEAPONS).toContain('Five-SeveN');
    expect(CASE_HARDENED_WEAPONS).not.toContain('Desert Eagle');
  });
});

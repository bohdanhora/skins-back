import { profilePath, toItems } from './steam-inventory.client';

describe('profilePath', () => {
  it('accepts links, SteamID64 and custom URL names', () => {
    expect(profilePath('https://steamcommunity.com/id/cocobohd/')).toBe('id/cocobohd');
    expect(profilePath('https://steamcommunity.com/profiles/76561198121485956')).toBe(
      'profiles/76561198121485956',
    );
    expect(profilePath('76561198121485956')).toBe('profiles/76561198121485956');
    expect(profilePath('cocobohd')).toBe('id/cocobohd');
  });

  it('rejects anything else', () => {
    expect(() => profilePath('https://example.com/a b')).toThrow();
  });
});

describe('toItems', () => {
  it('joins assets with descriptions and reads float and pattern', () => {
    const items = toItems({
      assets: [{ assetid: '1', classid: 'c', instanceid: 'i', amount: '1' }],
      descriptions: [
        {
          classid: 'c',
          instanceid: 'i',
          icon_url: 'icon',
          name: 'AK-47 | Redline',
          market_hash_name: 'AK-47 | Redline (Field-Tested)',
          tradable: 1,
          marketable: 1,
        },
      ],
      asset_properties: [
        {
          assetid: '1',
          asset_properties: [
            { propertyid: 1, int_value: '661' },
            { propertyid: 2, float_value: '0.151' },
          ],
        },
      ],
    });

    expect(items).toMatchObject([
      {
        assetId: '1',
        marketHashName: 'AK-47 | Redline (Field-Tested)',
        float: 0.151,
        paintSeed: 661,
        phase: null,
        tradable: true,
        marketable: true,
      },
    ]);
  });
});

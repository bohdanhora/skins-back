import { listingUrl, parseSteamPage, readBucket } from './steam-market.client';

describe('Steam market page', () => {
  it('reads the server-rendered listing payload', () => {
    const page = {
      pages: [
        {
          listings: [
            {
              listingid: '123',
              strSubtotal: 'UAH 1,225.00',
              description: { market_hash_name: 'AK-47 | Redline (Field-Tested)' },
              asset: {
                asset_properties: [
                  { propertyid: 1, int_value: '661' },
                  { propertyid: 2, float_value: 0.151 },
                ],
              },
            },
          ],
        },
      ],
    };
    const text = `0:${JSON.stringify(JSON.stringify(page))}`;
    const html = `<script>self.__next_f.push(${JSON.stringify([1, text])})</script>`;

    expect(parseSteamPage(html)).toEqual(page);
  });

  it('reads the current Steam render context', () => {
    const page = { pages: [{ listings: [] }] };
    const queryData = JSON.stringify({ queries: [{ state: { data: page } }] });
    const context = JSON.stringify({ queryData });
    const html = `<script>window.SSR.renderContext=JSON.parse(${JSON.stringify(context)});</script>`;

    expect(parseSteamPage(html)).toEqual(page);
  });

  it('finds the listing group and filters for an exact item', () => {
    const buckets = {
      buckets: [
        {
          bucket_id: 'AK-47 | Redline (Battle-Scarred)',
          filters: [
            ['Quality', 'normal'],
            ['Exterior', 'WearCategory4'],
          ],
        },
        {
          bucket_id: 'StatTrak™ AK-47 | Redline (Field-Tested)',
          filters: [
            ['Quality', 'strange'],
            ['Exterior', 'WearCategory2'],
          ],
        },
      ],
    };
    const query = {
      queryKey: ['market_item_search', { appid: 730, strItemName: 'G1807209A023004' }],
    };
    const html = `<script>x=${JSON.stringify(JSON.stringify({ query, props: JSON.stringify(buckets) }))}</script>`;

    expect(readBucket(html, 'StatTrak™ AK-47 | Redline (Field-Tested)')).toEqual({
      group: 'G1807209A023004',
      filters: { Quality: ['strange'], Exterior: ['WearCategory2'] },
    });
    expect(readBucket(html, 'AK-47 | Redline (Factory New)')).toBeNull();
  });

  it('links to the group page filtered to the exact wear', () => {
    expect(
      listingUrl('AK-47 | Redline (Field-Tested)', {
        group: 'G1807209A023004',
        filters: { Quality: ['normal'], Exterior: ['WearCategory2'] },
      }),
    ).toBe(
      'https://steamcommunity.com/market/listings/730/G1807209A023004?category_Quality=normal&category_Exterior=WearCategory2',
    );
  });
});

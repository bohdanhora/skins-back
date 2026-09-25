import { parseSteamPage } from './steam-market.client';

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
});

import { parsePatternImages, patternPageUrl } from './pattern-images';

describe('pattern images', () => {
  it('reads every seed image from the pattern.wiki page', () => {
    const html = `<script type="application/json" id="all-seeds-data">[{"s":661,"x":"0.3","url":"e719c42b"},{"s":"2","url":"ab12"},{"s":3,"url":"<bad>"}]</script>`;

    expect(parsePatternImages(html)).toEqual({ '661': 'e719c42b', '2': 'ab12' });
    expect(parsePatternImages('<html></html>')).toEqual({});
  });

  it('builds the skin page address', () => {
    expect(patternPageUrl('aq_oiled', 'weapon_ak47')).toBe(
      'https://pattern.wiki/skin/aq_oiled/weapon_ak47/',
    );
  });
});

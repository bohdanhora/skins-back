import { languageName, pickLocale, requestLocale, withLocale } from './locale';
import { text } from './messages';

describe('request locale', () => {
  it('reads the first supported language from Accept-Language', () => {
    expect(pickLocale('en-US,en;q=0.9,ru;q=0.8')).toBe('en');
    expect(pickLocale('de-DE,ru;q=0.5')).toBe('ru');
    expect(pickLocale('fr')).toBe('en');
    expect(pickLocale(undefined)).toBe('en');
  });

  it('answers in the language of the request', () => {
    expect(requestLocale()).toBe('en');
    expect(text('setLimit', { limit: 20 })).toBe('You can keep up to 20 sets');

    withLocale('ru', () => {
      expect(languageName()).toBe('Russian');
      expect(text('setNotFound')).toBe('Набор не найден');
    });
  });
});

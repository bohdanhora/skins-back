import {
  extractJson,
  findAssistantProvider,
  oneOf,
  positiveNumber,
  textList,
  usableModels,
} from './assistant-providers';

describe('assistant providers', () => {
  it('finds a provider by id', () => {
    expect(findAssistantProvider('openai')?.api).toBe('openai');
    expect(findAssistantProvider('nope')).toBeUndefined();
  });

  it('keeps chat models and puts the known ones first', () => {
    expect(
      usableModels(
        ['text-embedding-3', 'gpt-luna', 'gpt-5', 'models/gpt-4.1', 'whisper-1'],
        ['gpt-5'],
      ),
    ).toEqual(['gpt-5', 'gpt-4.1', 'gpt-luna']);
  });

  it('pulls JSON out of a chatty answer', () => {
    expect(extractJson<{ a: number }>('Here you go:\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extractJson<{ a: number }>('prefix {"a": 2} suffix')).toEqual({ a: 2 });
    expect(extractJson('no json here')).toBeNull();
  });

  it('keeps only the values it expects', () => {
    expect(oneOf('MW', ['FN', 'MW'] as const)).toBe('MW');
    expect(oneOf('XX', ['FN', 'MW'] as const)).toBeUndefined();
    expect(positiveNumber(-1)).toBeUndefined();
    expect(positiveNumber(12.5)).toBe(12.5);
    expect(textList(['a', 1, ' ', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });
});

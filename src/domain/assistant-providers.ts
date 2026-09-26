export type ProviderApi = 'anthropic' | 'openai' | 'chat';

export interface AssistantProvider {
  id: string;
  label: string;
  api: ProviderApi;
  baseUrl: string;
  apiKeysUrl: string;
  keyHint: string;
  defaultModel: string;
  models: string[];
  webSearch: boolean;
}

export const ASSISTANT_PROVIDERS: AssistantProvider[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    api: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKeysUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'sk-...',
    defaultModel: 'gpt-5',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1'],
    webSearch: true,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    api: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKeysUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'sk-ant-...',
    defaultModel: 'claude-opus-5',
    models: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5', 'claude-fable-5-1'],
    webSearch: true,
  },
  {
    id: 'google',
    label: 'Google Gemini',
    api: 'chat',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKeysUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'AIza...',
    defaultModel: 'gemini-2.5-flash',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    webSearch: false,
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    api: 'chat',
    baseUrl: 'https://api.x.ai/v1',
    apiKeysUrl: 'https://console.x.ai/',
    keyHint: 'xai-...',
    defaultModel: 'grok-4-fast',
    models: ['grok-4', 'grok-4-fast'],
    webSearch: false,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    api: 'chat',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeysUrl: 'https://openrouter.ai/keys',
    keyHint: 'sk-or-...',
    defaultModel: 'openai/gpt-5',
    models: ['openai/gpt-5', 'anthropic/claude-sonnet-5', 'google/gemini-2.5-flash'],
    webSearch: true,
  },
  {
    id: 'groq',
    label: 'Groq',
    api: 'chat',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeysUrl: 'https://console.groq.com/keys',
    keyHint: 'gsk_...',
    defaultModel: 'openai/gpt-oss-120b',
    models: ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'],
    webSearch: false,
  },
];

export const findAssistantProvider = (id: string): AssistantProvider | undefined =>
  ASSISTANT_PROVIDERS.find((provider) => provider.id === id);

const SKIPPED_MODELS =
  /embed|whisper|tts|dall-e|image|audio|moderation|rerank|guard|realtime|speech|transcri/i;

export const usableModels = (ids: string[], preferred: string[]): string[] => {
  const available = [...new Set(ids.map((id) => id.trim().replace(/^models\//, '')))].filter(
    (id) => id.length > 0 && !SKIPPED_MODELS.test(id),
  );
  const first = preferred.filter((id) => available.includes(id));

  return [...first, ...available.filter((id) => !first.includes(id)).sort()];
};

export const extractJson = <T>(text: string): T | null => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1];
  const source = fenced ?? text;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');

  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(source.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
};

export const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;

export const positiveNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

export const textList = (value: unknown, limit: number): string[] =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => entry.trim())
        .slice(0, limit)
    : [];

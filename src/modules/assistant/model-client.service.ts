import Anthropic from '@anthropic-ai/sdk';
import { BadGatewayException, Injectable, Logger } from '@nestjs/common';

import { usableModels, type AssistantProvider } from '../../domain/assistant-providers';

const TIMEOUT_MS = 120_000;
const MAX_TOKENS = 16_000;
const MAX_CONTINUATIONS = 3;
const SEARCH_USES = 5;
const FETCH_USES = 3;
const BAD_REQUEST = 400;
const UNAUTHORISED = 401;
const FALLBACK_MODELS = new Set(['claude-opus-5', 'claude-fable-5-1']);
const BASIC_TOOL_MODELS = /^claude-(haiku|3|sonnet-4-5|opus-4-5|opus-4-1|opus-4-0|sonnet-4-0)/;

export interface Credentials {
  provider: AssistantProvider;
  model: string;
  apiKey: string;
}

export interface AskInput {
  system: string;
  prompt: string;
  images?: string[];
  webSearch?: boolean;
  fetchLinks?: boolean;
}

export interface Source {
  url: string;
  title: string;
}

export interface AskResult {
  text: string;
  sources: Source[];
  searched: boolean;
}

interface ChatReply {
  choices?: {
    message?: {
      content?: string | null;
      annotations?: { type?: string; url_citation?: { url?: string; title?: string } }[];
    };
  }[];
}

interface ResponsesReply {
  output?: {
    type?: string;
    content?: {
      type?: string;
      text?: string;
      annotations?: { type?: string; url?: string; title?: string }[];
    }[];
  }[];
}

const dataUrlParts = (url: string): { mediaType: string; data: string } | null => {
  const match = url.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/);

  return match ? { mediaType: match[1], data: match[2] } : null;
};

const unique = (sources: Source[]): Source[] => [
  ...new Map(sources.filter((source) => source.url).map((source) => [source.url, source])).values(),
];

@Injectable()
export class ModelClientService {
  private readonly logger = new Logger(ModelClientService.name);

  async ask(credentials: Credentials, input: AskInput): Promise<AskResult> {
    if (credentials.provider.api === 'anthropic') return this.askAnthropic(credentials, input);
    if (credentials.provider.api === 'openai') return this.askResponses(credentials, input);

    return this.askChat(credentials, input);
  }

  async models(provider: AssistantProvider, apiKey: string): Promise<string[]> {
    try {
      if (provider.api === 'anthropic') {
        const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
        const ids: string[] = [];

        for await (const model of client.models.list()) {
          ids.push(model.id);
        }

        return usableModels(ids, provider.models);
      }

      const response = await fetch(`${provider.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (response.status === UNAUTHORISED) {
        throw new BadGatewayException('Провайдер отклонил ключ');
      }

      const payload = (await response.json().catch(() => null)) as {
        data?: { id?: string }[];
      } | null;

      return usableModels(
        (payload?.data ?? []).flatMap((entry) => (entry.id ? [entry.id] : [])),
        provider.models,
      );
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if (error instanceof Anthropic.AuthenticationError) {
        throw new BadGatewayException('Провайдер отклонил ключ');
      }

      this.logger.warn(`Listing ${provider.id} models failed: ${String(error)}`);
      return provider.models;
    }
  }

  private async askAnthropic(credentials: Credentials, input: AskInput): Promise<AskResult> {
    const client = new Anthropic({
      apiKey: credentials.apiKey,
      timeout: TIMEOUT_MS,
      maxRetries: 1,
    });
    const basic = BASIC_TOOL_MODELS.test(credentials.model);
    const tools: Anthropic.Beta.BetaToolUnion[] = [];

    if (input.webSearch) {
      tools.push(
        basic
          ? { type: 'web_search_20250305', name: 'web_search', max_uses: SEARCH_USES }
          : { type: 'web_search_20260209', name: 'web_search', max_uses: SEARCH_USES },
      );
    }

    if (input.fetchLinks) {
      tools.push(
        basic
          ? { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: FETCH_USES }
          : { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: FETCH_USES },
      );
    }

    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...(input.images ?? []).flatMap((url): Anthropic.Beta.BetaContentBlockParam[] => {
        const parts = dataUrlParts(url);

        return parts
          ? [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: parts.mediaType as 'image/png',
                  data: parts.data,
                },
              },
            ]
          : [];
      }),
      { type: 'text', text: input.prompt },
    ];
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content }];
    const fallback = FALLBACK_MODELS.has(credentials.model);
    const texts: string[] = [];
    const sources: Source[] = [];

    try {
      for (let turn = 0; turn <= MAX_CONTINUATIONS; turn += 1) {
        const response = await client.beta.messages.create({
          model: credentials.model,
          max_tokens: MAX_TOKENS,
          system: input.system,
          messages,
          ...(tools.length > 0 ? { tools } : {}),
          ...(fallback
            ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
            : {}),
        });

        if (response.stop_reason === 'refusal') {
          throw new BadGatewayException('Модель отказалась отвечать на этот запрос');
        }

        for (const block of response.content) {
          if (block.type === 'text') texts.push(block.text);
          if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
            sources.push(
              ...block.content.map((result) => ({ url: result.url, title: result.title })),
            );
          }
        }

        if (response.stop_reason !== 'pause_turn') break;

        messages.push({ role: 'assistant', content: response.content });
      }
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if (error instanceof Anthropic.AuthenticationError) {
        throw new BadGatewayException('Провайдер отклонил ключ');
      }
      if (error instanceof Anthropic.APIError) {
        throw new BadGatewayException(`Провайдер ответил ${error.status}: ${error.message}`);
      }

      throw error;
    }

    return { text: texts.join('\n'), sources: unique(sources), searched: !!input.webSearch };
  }

  private async post(
    credentials: Credentials,
    path: string,
    body: Record<string, unknown>,
  ): Promise<{ status: number; payload: unknown; raw: string }> {
    const response = await fetch(`${credentials.provider.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${credentials.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const raw = await response.text();
    let payload: unknown = null;

    try {
      payload = JSON.parse(raw);
    } catch {
      payload = null;
    }

    return { status: response.status, payload, raw };
  }

  private fail(status: number, raw: string): never {
    if (status === UNAUTHORISED) {
      throw new BadGatewayException('Провайдер отклонил ключ');
    }

    throw new BadGatewayException(`Провайдер ответил ${status}: ${raw.slice(0, 300)}`);
  }

  private async askResponses(credentials: Credentials, input: AskInput): Promise<AskResult> {
    const body = {
      model: credentials.model,
      instructions: input.system,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: input.prompt },
            ...(input.images ?? []).map((url) => ({ type: 'input_image', image_url: url })),
          ],
        },
      ],
    };
    const wantsSearch = !!(input.webSearch || input.fetchLinks);
    let searched = wantsSearch;
    let reply = await this.post(credentials, '/responses', {
      ...body,
      ...(wantsSearch ? { tools: [{ type: 'web_search' }] } : {}),
    });

    if (reply.status === BAD_REQUEST && wantsSearch) {
      this.logger.warn(`${credentials.model} refused web search: ${reply.raw.slice(0, 200)}`);
      searched = false;
      reply = await this.post(credentials, '/responses', body);
    }

    if (reply.status >= BAD_REQUEST) this.fail(reply.status, reply.raw);

    const payload = reply.payload as ResponsesReply;
    const texts: string[] = [];
    const sources: Source[] = [];

    for (const item of payload.output ?? []) {
      if (item.type !== 'message') continue;

      for (const part of item.content ?? []) {
        if (part.type === 'output_text' && part.text) texts.push(part.text);

        for (const note of part.annotations ?? []) {
          if (note.type === 'url_citation' && note.url) {
            sources.push({ url: note.url, title: note.title ?? note.url });
          }
        }
      }
    }

    return { text: texts.join('\n'), sources: unique(sources), searched };
  }

  private async askChat(credentials: Credentials, input: AskInput): Promise<AskResult> {
    const searched = !!input.webSearch && credentials.provider.webSearch;
    const model =
      searched && credentials.provider.id === 'openrouter'
        ? `${credentials.model}:online`
        : credentials.model;
    const images = input.images ?? [];
    const reply = await this.post(credentials, '/chat/completions', {
      model,
      messages: [
        { role: 'system', content: input.system },
        {
          role: 'user',
          content:
            images.length > 0
              ? [
                  { type: 'text', text: input.prompt },
                  ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
                ]
              : input.prompt,
        },
      ],
    });

    if (reply.status >= BAD_REQUEST) this.fail(reply.status, reply.raw);

    const message = (reply.payload as ChatReply).choices?.[0]?.message;

    return {
      text: message?.content ?? '',
      sources: unique(
        (message?.annotations ?? []).flatMap((note) =>
          note.url_citation?.url
            ? [
                {
                  url: note.url_citation.url,
                  title: note.url_citation.title ?? note.url_citation.url,
                },
              ]
            : [],
        ),
      ),
      searched,
    };
  }
}

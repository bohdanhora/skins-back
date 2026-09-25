const DEFAULT_TIMEOUT_MS = 20_000;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR_FLOOR = 500;

export class UpstreamError extends Error {
  readonly status: number;

  constructor(url: string, status: number, body: string) {
    super(`${url} answered ${status}: ${body.slice(0, 300)}`);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

export interface FetchJsonOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryable = (error: unknown): boolean =>
  !(error instanceof UpstreamError) ||
  error.status === TOO_MANY_REQUESTS ||
  error.status >= SERVER_ERROR_FLOOR;

export const fetchJson = async <T>(url: string, options: FetchJsonOptions = {}): Promise<T> => {
  const { method = 'GET', headers, body, timeoutMs = DEFAULT_TIMEOUT_MS, retries = 2 } = options;

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        headers: { Accept: 'application/json', ...headers },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new UpstreamError(url, response.status, await response.text().catch(() => ''));
      }

      return (await response.json()) as T;
    } catch (error) {
      if (attempt >= retries || !isRetryable(error)) {
        throw error;
      }

      await wait(500 * 2 ** attempt);
    }
  }
};

export const fetchText = async (url: string, options: FetchJsonOptions = {}): Promise<string> => {
  const { method = 'GET', headers, body, timeoutMs = DEFAULT_TIMEOUT_MS, retries = 2 } = options;

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        headers: { Accept: 'text/html', ...headers },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new UpstreamError(url, response.status, await response.text().catch(() => ''));
      }

      return await response.text();
    } catch (error) {
      if (attempt >= retries || !isRetryable(error)) {
        throw error;
      }

      await wait(500 * 2 ** attempt);
    }
  }
};

export { wait };

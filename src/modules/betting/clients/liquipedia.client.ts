import { Injectable } from '@nestjs/common';

import { fetchJson } from '../../../common/http/fetch-json';

const API_URL = 'https://liquipedia.net/counterstrike/api.php';
const USER_AGENT = 'SkinScout/1.0 (https://github.com/bohdanhora/skins-back)';
const PARSE_GAP_MS = 31_000;
const TIMEOUT_MS = 60_000;

interface RawParse {
  parse?: { text?: { '*'?: string } };
  error?: { info?: string };
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class LiquipediaClient {
  private queue: Promise<unknown> = Promise.resolve();
  private lastCall = 0;

  page(path: string): Promise<string> {
    const task = async (): Promise<string> => {
      const gap = this.lastCall + PARSE_GAP_MS - Date.now();

      if (gap > 0) await wait(gap);

      this.lastCall = Date.now();

      const query = new URLSearchParams({
        action: 'parse',
        page: path,
        prop: 'text',
        format: 'json',
      });
      const data = await fetchJson<RawParse>(`${API_URL}?${query}`, {
        headers: { 'User-Agent': USER_AGENT },
        retries: 0,
        timeoutMs: TIMEOUT_MS,
      });
      const html = data.parse?.text?.['*'];

      if (html === undefined) {
        throw new Error(`Liquipedia page "${path}": ${data.error?.info ?? 'missing'}`);
      }

      return html;
    };
    const next = this.queue.then(task, task);

    this.queue = next.catch(() => undefined);
    return next;
  }
}

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface CachedValue<T> {
  savedAt: number;
  value: T;
}

export class DiskCache {
  constructor(private readonly directory: string) {}

  async read<T>(key: string): Promise<CachedValue<T> | null> {
    try {
      const raw = await readFile(this.pathFor(key), 'utf8');

      return JSON.parse(raw) as CachedValue<T>;
    } catch {
      return null;
    }
  }

  async write<T>(key: string, value: T): Promise<void> {
    await mkdir(this.directory, { recursive: true });

    const target = this.pathFor(key);
    const temporary = `${target}.tmp`;
    const payload: CachedValue<T> = { savedAt: Date.now(), value };

    await writeFile(temporary, JSON.stringify(payload), 'utf8');
    await rename(temporary, target);
  }

  private pathFor(key: string): string {
    return join(this.directory, `${key}.json`);
  }
}

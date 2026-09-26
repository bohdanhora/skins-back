const SEEDS_SCRIPT = /<script[^>]*id="all-seeds-data"[^>]*>([\s\S]*?)<\/script>/;

export const PATTERN_IMAGE_BASE = 'https://static.pattern.wiki/img/';

export const patternPageUrl = (patternId: string, weaponId: string): string =>
  `https://pattern.wiki/skin/${encodeURIComponent(patternId)}/${encodeURIComponent(weaponId)}/`;

export const parsePatternImages = (html: string): Record<string, string> => {
  const match = SEEDS_SCRIPT.exec(html);

  if (!match) return {};

  const rows = JSON.parse(match[1]) as unknown;

  if (!Array.isArray(rows)) return {};

  const images: Record<string, string> = {};

  for (const row of rows as { s?: unknown; url?: unknown }[]) {
    const seed = Number(row.s);

    if (Number.isInteger(seed) && typeof row.url === 'string' && /^[0-9a-f]+$/.test(row.url)) {
      images[String(seed)] = row.url;
    }
  }

  return images;
};

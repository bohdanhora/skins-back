import { crc32 } from 'node:zlib';

export interface PreviewSticker {
  slot: number;
  stickerId: number;
  wear?: number;
  scale?: number;
  rotation?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface PreviewData {
  paintseed: number | null;
  stickers: PreviewSticker[];
}

export interface PreviewItem {
  defindex: number;
  paintindex: number;
  rarity?: number;
  quality?: number;
  paintwear: number;
  paintseed: number;
  stattrak?: boolean;
  stickers?: PreviewSticker[];
}

export const PREVIEW_COMMAND = 'csgo_econ_action_preview';
export const PREVIEW_LINK = `steam://rungame/730/76561202255233023/+${PREVIEW_COMMAND}%20`;
const MAX_STICKERS = 5;

const RARITY: Record<string, number> = {
  'Consumer Grade': 1,
  'Industrial Grade': 2,
  'Mil-Spec Grade': 3,
  Restricted: 4,
  Classified: 5,
  Covert: 6,
  Extraordinary: 6,
  Contraband: 7,
};

const STAR_QUALITY = 3;
const STATTRAK_QUALITY = 9;
const SOUVENIR_QUALITY = 12;

export const itemQuality = (name: string): number | undefined => {
  if (name.startsWith('★')) return name.includes('StatTrak™') ? STAR_QUALITY : undefined;
  if (name.startsWith('StatTrak™')) return STATTRAK_QUALITY;
  if (name.startsWith('Souvenir ')) return SOUVENIR_QUALITY;

  return undefined;
};

export const rarityIndex = (name: string): number | undefined => RARITY[name];

const varint = (value: number): number[] => {
  const bytes: number[] = [];
  let rest = value >>> 0;

  while (rest > 0x7f) {
    bytes.push((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }

  bytes.push(rest);

  return bytes;
};

const floatBits = (value: number): number => {
  const view = new DataView(new ArrayBuffer(4));

  view.setFloat32(0, value);

  return view.getUint32(0);
};

const float32 = (value: number): number[] => {
  const view = new DataView(new ArrayBuffer(4));

  view.setFloat32(0, value, true);

  return [...new Uint8Array(view.buffer)];
};

const tag = (field: number, wire: number): number[] => varint((field << 3) | wire);

const uint = (field: number, value: number): number[] => [...tag(field, 0), ...varint(value)];

const fixed = (field: number, value: number): number[] => [...tag(field, 5), ...float32(value)];

const nested = (field: number, bytes: number[]): number[] => [
  ...tag(field, 2),
  ...varint(bytes.length),
  ...bytes,
];

const encodeSticker = (sticker: PreviewSticker): number[] => [
  ...uint(1, sticker.slot),
  ...uint(2, sticker.stickerId),
  ...(sticker.wear === undefined ? [] : fixed(3, sticker.wear)),
  ...(sticker.scale === undefined ? [] : fixed(4, sticker.scale)),
  ...(sticker.rotation === undefined ? [] : fixed(5, sticker.rotation)),
  ...(sticker.offsetX === undefined ? [] : fixed(7, sticker.offsetX)),
  ...(sticker.offsetY === undefined ? [] : fixed(8, sticker.offsetY)),
];

const encodeItem = (item: PreviewItem): number[] => [
  ...uint(3, item.defindex),
  ...uint(4, item.paintindex),
  ...(item.rarity === undefined ? [] : uint(5, item.rarity)),
  ...(item.quality === undefined ? [] : uint(6, item.quality)),
  ...uint(7, floatBits(item.paintwear)),
  ...uint(8, item.paintseed),
  ...(item.stattrak ? [...uint(9, 0), ...uint(10, 0)] : []),
  ...(item.stickers ?? []).flatMap((sticker) => nested(12, encodeSticker(sticker))),
];

export const previewHex = (item: PreviewItem): string => {
  const proto = encodeItem(item);
  const payload = Buffer.from([0, ...proto]);
  const crc = crc32(payload);
  const checksum = Buffer.alloc(4);

  checksum.writeUInt32BE(((crc & 0xffff) ^ Math.imul(proto.length, crc)) >>> 0);

  return Buffer.concat([payload, checksum]).toString('hex').toUpperCase();
};

export const genKeepsPlacement = (item: PreviewItem): boolean =>
  (item.stickers ?? []).every(
    (sticker) =>
      sticker.slot < MAX_STICKERS &&
      sticker.offsetX === undefined &&
      sticker.offsetY === undefined &&
      sticker.rotation === undefined &&
      sticker.scale === undefined,
  );

export const genCommand = (item: PreviewItem): string => {
  const stickers = [...(item.stickers ?? [])].sort((left, right) => left.slot - right.slot);
  const positional = stickers.every((sticker) => sticker.slot < MAX_STICKERS);
  const slots = Array.from({ length: MAX_STICKERS }, (_, slot) => {
    const sticker = positional ? stickers.find((entry) => entry.slot === slot) : stickers[slot];

    return sticker ? `${sticker.stickerId} ${sticker.wear ?? 0}` : '0 0';
  });

  return `!gen ${item.defindex} ${item.paintindex} ${item.paintseed} ${item.paintwear} ${slots.join(' ')}`;
};

const PREVIEW_HEX = /csgo_econ_action_preview(?:%20|\s+)([0-9A-F]+)/i;
const STICKER_FIELDS: Partial<Record<number, keyof PreviewSticker>> = {
  3: 'wear',
  4: 'scale',
  5: 'rotation',
  7: 'offsetX',
  8: 'offsetY',
};

type Field = [field: number, value: number | Buffer];

const readFields = (bytes: Buffer): Field[] | null => {
  const fields: Field[] = [];
  let at = 0;

  const readVarint = (): number | null => {
    let value = 0;
    let shift = 0;

    while (at < bytes.length) {
      const byte = bytes[at++];

      value += (byte & 0x7f) * 2 ** shift;
      shift += 7;

      if ((byte & 0x80) === 0) return value;
    }

    return null;
  };

  while (at < bytes.length) {
    const key = readVarint();

    if (key === null) return null;

    const field = Math.floor(key / 8);
    const wire = key % 8;

    if (wire === 0) {
      const value = readVarint();

      if (value === null) return null;
      fields.push([field, value]);
    } else if (wire === 5) {
      if (at + 4 > bytes.length) return null;
      fields.push([field, bytes.readFloatLE(at)]);
      at += 4;
    } else if (wire === 2) {
      const length = readVarint();

      if (length === null || at + length > bytes.length) return null;
      fields.push([field, bytes.subarray(at, at + length)]);
      at += length;
    } else {
      return null;
    }
  }

  return fields;
};

const readSticker = (bytes: Buffer): PreviewSticker | null => {
  const fields = readFields(bytes);

  if (!fields) return null;

  const sticker: PreviewSticker = { slot: 0, stickerId: 0 };

  for (const [field, value] of fields) {
    if (typeof value !== 'number') continue;
    if (field === 1) sticker.slot = value;
    if (field === 2) sticker.stickerId = value;

    const name = STICKER_FIELDS[field];

    if (name) Object.assign(sticker, { [name]: value });
  }

  return sticker.stickerId > 0 ? sticker : null;
};

export const readPreview = (link: string | null | undefined): PreviewData | null => {
  const hex = link ? PREVIEW_HEX.exec(link)?.[1] : undefined;

  if (!hex || hex.length % 2 !== 0 || hex.length < 12) return null;

  const raw = Buffer.from(hex, 'hex');
  const bytes = raw[0] === 0 ? raw : Buffer.from(raw.map((byte) => byte ^ raw[0]));
  const fields = readFields(bytes.subarray(1, bytes.length - 4));

  if (!fields) return null;

  const seed = fields.find(([field, value]) => field === 8 && typeof value === 'number');
  const stickers = fields.flatMap(([field, value]) => {
    const sticker = field === 12 && typeof value !== 'number' ? readSticker(value) : null;

    return sticker ? [sticker] : [];
  });

  return { paintseed: seed ? (seed[1] as number) : null, stickers };
};

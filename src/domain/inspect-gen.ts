import { crc32 } from 'node:zlib';

export interface PreviewSticker {
  slot: number;
  stickerId: number;
  wear?: number;
  scale?: number;
  rotation?: number;
}

export interface PreviewItem {
  defindex: number;
  paintindex: number;
  rarity?: number;
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
];

const encodeItem = (item: PreviewItem): number[] => [
  ...uint(3, item.defindex),
  ...uint(4, item.paintindex),
  ...(item.rarity === undefined ? [] : uint(5, item.rarity)),
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

export const genCommand = (item: PreviewItem): string => {
  const slots = Array.from({ length: MAX_STICKERS }, (_, slot) => {
    const sticker = item.stickers?.find((entry) => entry.slot === slot);

    return sticker ? `${sticker.stickerId} ${sticker.wear ?? 0}` : '0 0';
  });

  return `!gen ${item.defindex} ${item.paintindex} ${item.paintseed} ${item.paintwear} ${slots.join(' ')}`;
};

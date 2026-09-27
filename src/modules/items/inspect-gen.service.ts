import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import {
  genCommand,
  genKeepsPlacement,
  itemQuality,
  PREVIEW_COMMAND,
  PREVIEW_LINK,
  previewHex,
  rarityIndex,
  type PreviewItem,
  type PreviewSticker,
} from '../../domain/inspect-gen';
import { paintIndexForPhase, parseVariantName } from '../../domain/market-variant';
import { skinBaseName } from '../../domain/skin-name';
import { CatalogService } from '../catalog/catalog.service';
import { type InspectGenDto, type InspectGenQueryDto } from './dto/inspect-gen.dto';

const WEAR_RANGES: Record<string, [number, number]> = {
  'Factory New': [0, 0.07],
  'Minimal Wear': [0.07, 0.15],
  'Field-Tested': [0.15, 0.38],
  'Well-Worn': [0.38, 0.45],
  'Battle-Scarred': [0.45, 1],
};
const WEAR = / \(([^)]+)\)$/;
const DEFAULT_SEED = 1;

@Injectable()
export class InspectGenService {
  constructor(private readonly catalog: CatalogService) {}

  generate(query: InspectGenQueryDto): InspectGenDto {
    const variant = parseVariantName(query.name);
    const skin = this.catalog.skin(skinBaseName(variant.marketHashName));
    const paintindex =
      (variant.phase && skin ? paintIndexForPhase(skin.name, variant.phase) : null) ??
      skin?.paintIndex ??
      null;

    if (!skin || skin.weaponIndex === null || paintindex === null) {
      throw new NotFoundException(`No generator data for "${query.name}"`);
    }

    const wear = WEAR_RANGES[WEAR.exec(variant.marketHashName)?.[1] ?? ''] ?? [0, 1];
    const low = Math.max(wear[0], skin.minFloat);
    const high = Math.min(wear[1], skin.maxFloat);
    const float = query.float ?? low;

    if (float < low || float > high) {
      throw new BadRequestException(`Float must be between ${low} and ${high}`);
    }

    const missingStickers: string[] = [];
    const taken = new Set(
      (query.layout ?? []).flatMap((place) =>
        typeof place?.slot === 'number' ? [place.slot] : [],
      ),
    );
    const freeSlot = (): number => {
      let slot = 0;

      while (taken.has(slot)) slot += 1;
      taken.add(slot);

      return slot;
    };
    const stickers = (query.stickers ?? []).flatMap((name, index): PreviewSticker[] => {
      const place = query.layout?.[index];
      const slot = typeof place?.slot === 'number' ? place.slot : freeSlot();
      const stickerId =
        this.catalog.get(name)?.defIndex ?? this.catalog.get(`Sticker | ${name}`)?.defIndex;

      if (stickerId === undefined || stickerId === null) {
        missingStickers.push(name);

        return [];
      }

      return [
        {
          slot,
          stickerId,
          wear: place?.wear ?? 0,
          ...(typeof place?.scale === 'number' ? { scale: place.scale } : {}),
          ...(typeof place?.rotation === 'number' ? { rotation: place.rotation } : {}),
          ...(typeof place?.offsetX === 'number' ? { offsetX: place.offsetX } : {}),
          ...(typeof place?.offsetY === 'number' ? { offsetY: place.offsetY } : {}),
        },
      ];
    });
    const item: PreviewItem = {
      defindex: skin.weaponIndex,
      paintindex,
      rarity: rarityIndex(skin.rarity),
      quality: itemQuality(variant.marketHashName),
      paintwear: float,
      paintseed: query.seed ?? DEFAULT_SEED,
      stattrak: variant.marketHashName.includes('StatTrak™'),
      stickers,
    };
    const hex = previewHex(item);

    return {
      name: query.name,
      float,
      seed: item.paintseed,
      console: `${PREVIEW_COMMAND} ${hex}`,
      link: `${PREVIEW_LINK}${hex}`,
      server: `!i ${PREVIEW_LINK}${hex}`,
      gen: genCommand(item),
      genExact: genKeepsPlacement(item),
      missingStickers,
    };
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import {
  genCommand,
  PREVIEW_COMMAND,
  PREVIEW_LINK,
  previewHex,
  rarityIndex,
  type PreviewItem,
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
    const stickers = (query.stickers ?? []).flatMap((name, slot) => {
      const stickerId =
        this.catalog.get(name)?.defIndex ?? this.catalog.get(`Sticker | ${name}`)?.defIndex;

      if (stickerId === undefined || stickerId === null) {
        missingStickers.push(name);

        return [];
      }

      return [{ slot, stickerId, wear: 0 }];
    });
    const item: PreviewItem = {
      defindex: skin.weaponIndex,
      paintindex,
      rarity: rarityIndex(skin.rarity),
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
      missingStickers,
    };
  }
}

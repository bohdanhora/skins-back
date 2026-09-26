import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { fetchJson, fetchText, UpstreamError } from '../../common/http/fetch-json';
import { readAssetTraits, type AssetTraits, type RawAssetProperty } from './steam-asset';

const COMMUNITY_URL = 'https://steamcommunity.com';
const IMAGE_URL = 'https://community.cloudflare.steamstatic.com/economy/image';
const PAGE_SIZE = 1000;
const MAX_PAGES = 10;
const STEAM_ID = /^7656\d{13}$/;
const FORBIDDEN = 403;
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; SkinScout/1.0)' };

interface RawAsset {
  assetid: string;
  classid: string;
  instanceid: string;
  amount: string;
}

interface RawDescription {
  classid: string;
  instanceid: string;
  icon_url?: string;
  name?: string;
  name_color?: string;
  type?: string;
  market_hash_name?: string;
  tradable?: number;
  marketable?: number;
}

interface RawInventory {
  assets?: RawAsset[];
  descriptions?: RawDescription[];
  asset_properties?: { assetid: string; asset_properties?: RawAssetProperty[] }[];
  total_inventory_count?: number;
  more_items?: number;
  last_assetid?: string;
  success?: number;
}

export interface SteamProfile {
  steamId: string;
  name: string | null;
  avatar: string | null;
}

export interface SteamInventoryItem extends AssetTraits {
  assetId: string;
  marketHashName: string;
  name: string;
  type: string;
  nameColor: string | null;
  image: string | null;
  amount: number;
  tradable: boolean;
  marketable: boolean;
}

const tagValue = (xml: string, tag: string): string | null => {
  const match = xml.match(
    new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`),
  );

  return match ? match[1].trim() : null;
};

export const profilePath = (input: string): string => {
  const value = input.trim().replace(/\/+$/, '');

  if (STEAM_ID.test(value)) {
    return `profiles/${value}`;
  }

  const match = value.match(/steamcommunity\.com\/(id|profiles)\/([^/?#]+)/i);

  if (match) {
    return `${match[1].toLowerCase()}/${match[2]}`;
  }

  if (/^[\w-]{2,64}$/.test(value)) {
    return `id/${value}`;
  }

  throw new BadRequestException('Profile must be a Steam link, SteamID64 or custom URL name');
};

@Injectable()
export class SteamInventoryClient {
  async resolveProfile(input: string): Promise<SteamProfile> {
    const xml = await fetchText(`${COMMUNITY_URL}/${profilePath(input)}/?xml=1`, {
      headers: HEADERS,
      retries: 1,
    });
    const steamId = tagValue(xml, 'steamID64');

    if (!steamId || !STEAM_ID.test(steamId)) {
      throw new NotFoundException('Steam profile not found');
    }

    return {
      steamId,
      name: tagValue(xml, 'steamID'),
      avatar: tagValue(xml, 'avatarMedium'),
    };
  }

  async fetchInventory(steamId: string): Promise<SteamInventoryItem[]> {
    const items: SteamInventoryItem[] = [];
    let start: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ l: 'english', count: String(PAGE_SIZE) });

      if (start) query.set('start_assetid', start);

      const raw = await this.fetchPage(steamId, query);

      items.push(...toItems(raw));

      if (!raw.more_items || !raw.last_assetid) break;

      start = raw.last_assetid;
    }

    return items;
  }

  private async fetchPage(steamId: string, query: URLSearchParams): Promise<RawInventory> {
    try {
      return await fetchJson<RawInventory>(
        `${COMMUNITY_URL}/inventory/${steamId}/730/2?${query.toString()}`,
        { headers: HEADERS, retries: 1 },
      );
    } catch (error) {
      if (error instanceof UpstreamError && error.status === FORBIDDEN) {
        throw new BadRequestException('Steam inventory is private');
      }

      throw error;
    }
  }
}

export const toItems = (raw: RawInventory): SteamInventoryItem[] => {
  const descriptions = new Map(
    (raw.descriptions ?? []).map((entry) => [`${entry.classid}_${entry.instanceid}`, entry]),
  );
  const properties = new Map(
    (raw.asset_properties ?? []).map((entry) => [entry.assetid, entry.asset_properties ?? []]),
  );

  return (raw.assets ?? []).flatMap((asset) => {
    const description = descriptions.get(`${asset.classid}_${asset.instanceid}`);

    if (!description?.market_hash_name) {
      return [];
    }

    return [
      {
        assetId: asset.assetid,
        marketHashName: description.market_hash_name,
        name: description.name ?? description.market_hash_name,
        type: description.type ?? '',
        nameColor: description.name_color ? `#${description.name_color}` : null,
        image: description.icon_url ? `${IMAGE_URL}/${description.icon_url}/256fx256f` : null,
        amount: Number(asset.amount) || 1,
        tradable: description.tradable === 1,
        marketable: description.marketable === 1,
        ...readAssetTraits(properties.get(asset.assetid)),
      },
    ];
  });
};

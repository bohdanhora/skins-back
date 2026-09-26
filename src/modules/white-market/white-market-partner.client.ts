import { Inject, Injectable } from '@nestjs/common';

import { fetchJson } from '../../common/http/fetch-json';
import { whiteMarketConfig, type WhiteMarketConfig } from '../../config/app.config';
import {
  dollarsToCents,
  toStickerItemName,
  withoutStickerPrefix,
  type Listing,
} from '../../domain/listing';
import { MarketId, whiteMarketItemUrl, whiteMarketListingUrl } from '../../domain/market-links';
import { type MarketPhase } from '../../domain/market-variant';

const GRAPHQL_URL = 'https://api.white.market/graphql/partner';
const ACCESS_TOKEN_TTL_MS = 23 * 60 * 60_000;
const STICKER_SUGGESTIONS = 20;

const AUTH_MUTATION = 'mutation { auth_token { accessToken } }';

const LISTINGS_QUERY = `
query Listings($search: MarketProductSearchInput, $first: Int, $after: String) {
  market_list(search: $search, forwardPagination: { first: $first, after: $after }) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        slug
        price { value }
        item {
          ... on CSGOInventoryItem {
            float
            paintSeed
            nameHash
            stickers { name title icon }
            description { ... on CSGOSteamItem { icon } }
          }
        }
      }
    }
  }
}`;

const STICKER_SUGGESTION_QUERY = `
query Stickers($search: String!, $limit: Int) {
  market_csgo_stickers_suggestion(search: $search, limit: $limit) {
    suggestions { name title }
  }
}`;

interface GraphqlResponse<T> {
  data?: T;
  errors?: { message: string }[];
  extensions?: { warnings?: { message: string }[] };
}

interface RawProduct {
  id: string;
  slug?: string | null;
  price: { value: string };
  item: {
    float?: string | null;
    paintSeed?: string | null;
    nameHash?: string | null;
    stickers?: ({ name: string; title: string; icon: string | null } | null)[] | null;
    description?: { icon?: string | null } | null;
  } | null;
}

export type WhiteMarketListing = Listing & { paintSeed: number | null };

interface RawListingsPage {
  market_list: {
    pageInfo?: { hasNextPage: boolean; endCursor: string | null };
    edges: { node: RawProduct }[];
  };
}

const PATTERN_PAGE_SIZE = 200;

export interface WhiteMarketListingSearch {
  name?: string;
  nameContains?: string;
  stickers?: string[];
  priceFrom?: number;
  priceTo?: number;
  floatFrom?: number;
  floatTo?: number;
  phase?: MarketPhase | null;
  limit: number;
}

const WHITE_MARKET_PHASES: Record<MarketPhase, string> = {
  'phase-1': 'PHASE1',
  'phase-2': 'PHASE2',
  'phase-3': 'PHASE3',
  'phase-4': 'PHASE4',
  ruby: 'RUBY',
  sapphire: 'SAPPHIRE',
  emerald: 'EMERALD',
  'black-pearl': 'BLACK_PEARL',
};

const centsToMoney = (cents: number): { value: string; currency: 'USD' } => ({
  value: (cents / 100).toFixed(2),
  currency: 'USD',
});

@Injectable()
export class WhiteMarketPartnerClient {
  private accessToken: { value: string; expiresAt: number } | null = null;

  constructor(@Inject(whiteMarketConfig.KEY) private readonly config: WhiteMarketConfig) {}

  get isEnabled(): boolean {
    return this.config.isPartnerEnabled;
  }

  async searchListings(search: WhiteMarketListingSearch): Promise<WhiteMarketListing[]> {
    const stickerNames = search.stickers?.length
      ? await Promise.all(search.stickers.map((sticker) => this.resolveStickerName(sticker)))
      : undefined;

    const data = await this.request<RawListingsPage>(LISTINGS_QUERY, {
      first: search.limit,
      search: {
        appId: 'CSGO',
        ...(search.name ? { nameHash: search.name, nameStrict: true } : {}),
        ...(!search.name && search.nameContains ? { name: search.nameContains } : {}),
        ...(stickerNames ? { csgoStickerNames: stickerNames, csgoStickerNamesOperand: 'AND' } : {}),
        ...(search.priceFrom !== undefined || search.priceTo !== undefined
          ? {
              price: {
                ...(search.priceFrom !== undefined ? { from: centsToMoney(search.priceFrom) } : {}),
                ...(search.priceTo !== undefined ? { to: centsToMoney(search.priceTo) } : {}),
              },
            }
          : {}),
        ...(search.floatFrom !== undefined ? { csgoFloatFrom: String(search.floatFrom) } : {}),
        ...(search.floatTo !== undefined ? { csgoFloatTo: String(search.floatTo) } : {}),
        ...(search.phase ? { csgoPhase: WHITE_MARKET_PHASES[search.phase] } : {}),
        sort: { field: 'PRICE', type: 'ASC' },
      },
    });

    return data.market_list.edges.map(({ node }) => this.toListing(node));
  }

  async searchAllListings(nameContains: string, maxPages: number): Promise<WhiteMarketListing[]> {
    const listings: WhiteMarketListing[] = [];
    let after: string | null = null;

    for (let page = 0; page < maxPages; page += 1) {
      const data: RawListingsPage = await this.request<RawListingsPage>(LISTINGS_QUERY, {
        first: PATTERN_PAGE_SIZE,
        after,
        search: { appId: 'CSGO', name: nameContains, sort: { field: 'PRICE', type: 'ASC' } },
      });

      listings.push(...data.market_list.edges.map(({ node }) => this.toListing(node)));

      after = data.market_list.pageInfo?.hasNextPage
        ? (data.market_list.pageInfo.endCursor ?? null)
        : null;

      if (!after) break;
    }

    return listings;
  }

  private async resolveStickerName(sticker: string): Promise<string> {
    const wanted = toStickerItemName(sticker).toLowerCase();
    const data = await this.request<{
      market_csgo_stickers_suggestion: { suggestions: { name: string; title: string }[] | null };
    }>(STICKER_SUGGESTION_QUERY, {
      search: withoutStickerPrefix(sticker),
      limit: STICKER_SUGGESTIONS,
    });

    const match = (data.market_csgo_stickers_suggestion.suggestions ?? []).find(
      (suggestion) =>
        toStickerItemName(suggestion.title).toLowerCase() === wanted ||
        toStickerItemName(suggestion.name).toLowerCase() === wanted,
    );

    return match?.name ?? withoutStickerPrefix(sticker);
  }

  private toListing(node: RawProduct): WhiteMarketListing {
    const name = node.item?.nameHash ?? '';

    return {
      market: MarketId.WhiteMarket,
      id: node.id,
      name,
      image: node.item?.description?.icon ?? null,
      price: dollarsToCents(node.price.value),
      float: node.item?.float ?? null,
      paintSeed: toSeed(node.item?.paintSeed),
      stickers: (node.item?.stickers ?? [])
        .filter((sticker) => sticker !== null)
        .map((sticker) => ({
          name: toStickerItemName(sticker.title || sticker.name),
          image: sticker.icon,
        })),
      url: node.slug ? whiteMarketListingUrl(node.slug) : whiteMarketItemUrl(name),
    };
  }

  private async request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const token = await this.getAccessToken();
    const response = await fetchJson<GraphqlResponse<T>>(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables }),
    });

    return this.unwrap(response);
  }

  private async getAccessToken(): Promise<string> {
    if (!this.isEnabled) {
      throw new Error('white.market partner token is not configured');
    }

    if (this.accessToken && this.accessToken.expiresAt > Date.now()) {
      return this.accessToken.value;
    }

    const response = await fetchJson<GraphqlResponse<{ auth_token: { accessToken: string } }>>(
      GRAPHQL_URL,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-partner-token': this.config.partnerToken,
        },
        body: JSON.stringify({ query: AUTH_MUTATION }),
      },
    );
    const value = this.unwrap(response).auth_token.accessToken;

    this.accessToken = { value, expiresAt: Date.now() + ACCESS_TOKEN_TTL_MS };
    return value;
  }

  private unwrap<T>(response: GraphqlResponse<T>): T {
    const problem = response.errors?.[0]?.message ?? response.extensions?.warnings?.[0]?.message;

    if (problem || !response.data) {
      this.accessToken = null;
      throw new Error(`white.market: ${problem ?? 'empty response'}`);
    }

    return response.data;
  }
}

const toSeed = (value: string | null | undefined): number | null => {
  const seed = Number(value);

  return value !== null && value !== undefined && value !== '' && Number.isInteger(seed)
    ? seed
    : null;
};

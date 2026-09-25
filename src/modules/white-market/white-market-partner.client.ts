import { Inject, Injectable } from '@nestjs/common';

import { fetchJson } from '../../common/http/fetch-json';
import { whiteMarketConfig, type WhiteMarketConfig } from '../../config/app.config';
import {
  dollarsToCents,
  toStickerItemName,
  withoutStickerPrefix,
  type Listing,
} from '../../domain/listing';
import { MarketId, whiteMarketItemUrl } from '../../domain/market-links';

const GRAPHQL_URL = 'https://api.white.market/graphql/partner';
/** Access tokens live 24 hours; renew a little earlier. */
const ACCESS_TOKEN_TTL_MS = 23 * 60 * 60_000;
const STICKER_SUGGESTIONS = 20;

const AUTH_MUTATION = 'mutation { auth_token { accessToken } }';

const LISTINGS_QUERY = `
query Listings($search: MarketProductSearchInput, $first: Int) {
  market_list(search: $search, forwardPagination: { first: $first }) {
    edges {
      node {
        id
        price { value }
        item {
          ... on CSGOInventoryItem {
            float
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
  price: { value: string };
  item: {
    float?: string | null;
    nameHash?: string | null;
    stickers?: ({ name: string; title: string; icon: string | null } | null)[] | null;
    description?: { icon?: string | null } | null;
  } | null;
}

export interface WhiteMarketListingSearch {
  name?: string;
  stickers?: string[];
  priceFrom?: number;
  priceTo?: number;
  floatFrom?: number;
  floatTo?: number;
  limit: number;
}

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

  async searchListings(search: WhiteMarketListingSearch): Promise<Listing[]> {
    const stickerNames = search.stickers?.length
      ? await Promise.all(search.stickers.map((sticker) => this.resolveStickerName(sticker)))
      : undefined;

    const data = await this.request<{ market_list: { edges: { node: RawProduct }[] } }>(
      LISTINGS_QUERY,
      {
        first: search.limit,
        search: {
          appId: 'CSGO',
          ...(search.name ? { nameHash: search.name, nameStrict: true } : {}),
          ...(stickerNames
            ? { csgoStickerNames: stickerNames, csgoStickerNamesOperand: 'AND' }
            : {}),
          ...(search.priceFrom !== undefined || search.priceTo !== undefined
            ? {
                price: {
                  ...(search.priceFrom !== undefined
                    ? { from: centsToMoney(search.priceFrom) }
                    : {}),
                  ...(search.priceTo !== undefined ? { to: centsToMoney(search.priceTo) } : {}),
                },
              }
            : {}),
          ...(search.floatFrom !== undefined ? { csgoFloatFrom: String(search.floatFrom) } : {}),
          ...(search.floatTo !== undefined ? { csgoFloatTo: String(search.floatTo) } : {}),
          sort: { field: 'PRICE', type: 'ASC' },
        },
      },
    );

    return data.market_list.edges.map(({ node }) => this.toListing(node));
  }

  /** Maps a catalog sticker name to the exact spelling white.market filters by. */
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

  private toListing(node: RawProduct): Listing {
    const name = node.item?.nameHash ?? '';

    return {
      market: MarketId.WhiteMarket,
      id: node.id,
      name,
      image: node.item?.description?.icon ?? null,
      price: dollarsToCents(node.price.value),
      float: node.item?.float ?? null,
      stickers: (node.item?.stickers ?? [])
        .filter((sticker) => sticker !== null)
        .map((sticker) => ({
          name: toStickerItemName(sticker.title || sticker.name),
          image: sticker.icon,
        })),
      url: whiteMarketItemUrl(name),
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

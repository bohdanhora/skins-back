import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { extractJson, oneOf, positiveNumber, textList } from '../../domain/assistant-providers';
import { MARKET_PHASES } from '../../domain/market-variant';
import { BettingService } from '../betting/betting.service';
import type { MatchForecastDto, MarketOfferDto } from '../betting/dto/betting.dto';
import { CatalogService } from '../catalog/catalog.service';
import { CsfloatClient, CsfloatPausedError } from '../csfloat/csfloat.client';
import { PriceBoardService } from '../prices/price-board.service';
import { AssistantService } from './assistant.service';
import type {
  MatchBriefDto,
  PurchaseDraftDto,
  PurchaseDraftInputDto,
  SmartSearchDto,
} from './dto/assistant.dto';
import { ModelClientService } from './model-client.service';

const BRIEF_TTL_MS = 20 * 60_000;
const TOP_MARKETS = 6;
const CSFLOAT_ITEM = /csfloat\.com\/item\/(\d+)/;
const VERDICTS = ['confirm', 'caution', 'avoid', 'no_bet'] as const;
const PURCHASE_MARKETS = [
  'whiteMarket',
  'dmarket',
  'csfloat',
  'lisSkins',
  'steam',
  'other',
] as const;
const CATEGORIES = [
  'knife',
  'gloves',
  'rifle',
  'sniper',
  'pistol',
  'smg',
  'heavy',
  'sticker',
  'container',
  'agent',
  'charm',
  'other',
] as const;
const WEARS = ['FN', 'MW', 'FT', 'WW', 'BS'] as const;
const EDITIONS = ['normal', 'stattrak', 'souvenir'] as const;
const SORTS = ['priceAsc', 'priceDesc', 'sales8w', 'belowSales', 'benefit', 'fresh'] as const;

const BRIEF_SYSTEM = `You are a careful CS2 esports betting analyst working inside a tool that already computed a map-by-map forecast.
Rules:
- Every probability, price and odds value comes from the JSON you are given. Never invent or change numbers.
- Search the web for news from the last 14 days about both teams: roster changes, stand-ins, benched or sick players, visa problems, recent form. Prefer hltv.org, liquipedia.net, dust2.us, bo3.gg and the teams' own channels.
- Judge the suggested best bet: an edge above 15%, a team name that may be mismatched, few maps of history or stale odds are reasons to mark it "check".
- Write in Russian, short and concrete, no filler.
Answer with a single JSON object and nothing else:
{"verdict":"confirm|caution|avoid|no_bet","summary":"2-3 sentences","warnings":["..."],"betCheck":{"status":"ok|check","reason":"one sentence"},"lineups":{"team1":["player"],"team2":["player"]}}
verdict: confirm when the news supports the best bet, caution when something could change the outcome, avoid when the news breaks the forecast, no_bet when there is no best bet.
lineups: the five players expected to play, empty lists if unknown.`;

const DRAFT_SYSTEM = `You read a CS2 skin purchase from a screenshot, a listing page or a short text.
Answer with a single JSON object and nothing else:
{"name":"exact Steam market hash name in English, e.g. \\"StatTrak™ AK-47 | Redline (Field-Tested)\\" or \\"★ Karambit | Doppler (Factory New)\\"","price":12.34,"float":0.123456,"paintSeed":661,"stickers":["Sticker | Natus Vincere (Holo) | Cologne 2014"],"market":"whiteMarket|dmarket|csfloat|steam|other"}
price is in US dollars as a number. Use null for anything you cannot see. Never guess a float or a pattern.`;

const SEARCH_SYSTEM = `You turn a CS2 skin search request into filters for a price comparison site.
Answer with a single JSON object and nothing else:
{"q":"words to match in the item name, English","category":"${CATEGORIES.join('|')}","wear":"${WEARS.join('|')}","edition":"${EDITIONS.join('|')}","phase":"${MARKET_PHASES.join('|')}","minPrice":10,"maxPrice":200,"sort":"${SORTS.join('|')}","note":"in Russian, only when part of the request cannot be expressed with these filters"}
Leave out every field the request does not mention. Prices are in US dollars. Knife and glove names start with "★" but q must not contain it.`;

const compactOffer = (offer: MarketOfferDto) => ({
  kind: offer.kind,
  line: offer.line,
  mapIndex: offer.mapIndex,
  side: offer.side,
  modelChance: Math.round(offer.model * 1000) / 10,
  marketChance: offer.market === null ? null : Math.round(offer.market * 1000) / 10,
  odds: offer.odds,
  bookmaker: offer.bookmaker,
  bookmakers: offer.bookmakers,
  edgePercent: Math.round(offer.expectedValue * 1000) / 10,
});

const matchFacts = (match: MatchForecastDto) => ({
  event: match.event,
  stage: match.stage,
  startsAt: match.startsAt,
  bestOf: match.bestOf,
  team1: {
    name: match.team1.name,
    valveRank: match.team1.rank,
    rosterByValve: match.team1.roster,
    mapsInHistory: match.team1.mapGames,
  },
  team2: {
    name: match.team2.name,
    valveRank: match.team2.rank,
    rosterByValve: match.team2.roster,
    mapsInHistory: match.team2.mapGames,
  },
  team1WinChance: Math.round(match.win * 1000) / 10,
  scores: match.scores,
  plannedMaps: match.maps.map((entry) => ({
    map: entry.map,
    pickedBy: entry.pickedBy,
    team1Chance: Math.round(entry.chance * 1000) / 10,
  })),
  dataConfidence: match.confidence,
  bestBet: match.bestBet ? compactOffer(match.bestBet) : null,
  otherBets: match.markets.slice(0, TOP_MARKETS).map(compactOffer),
});

@Injectable()
export class AssistantTasksService {
  private readonly briefs = new Map<string, { at: number; value: MatchBriefDto }>();

  constructor(
    private readonly assistant: AssistantService,
    private readonly client: ModelClientService,
    private readonly betting: BettingService,
    private readonly csfloat: CsfloatClient,
    private readonly board: PriceBoardService,
    private readonly catalog: CatalogService,
  ) {}

  async brief(userId: string, matchId: number, refresh: boolean): Promise<MatchBriefDto> {
    const key = `${userId}:${matchId}`;
    const cached = this.briefs.get(key);

    if (!refresh && cached && Date.now() - cached.at < BRIEF_TTL_MS) {
      return cached.value;
    }

    const credentials = await this.assistant.credentials(userId);
    const match = await this.betting.match(matchId);

    if (!match) throw new NotFoundException('Матч не найден');

    const answer = await this.client.ask(credentials, {
      system: BRIEF_SYSTEM,
      prompt: `Forecast data:\n${JSON.stringify(matchFacts(match), null, 1)}`,
      webSearch: true,
    });
    const parsed = extractJson<Record<string, unknown>>(answer.text) ?? {};
    const betCheck = (parsed.betCheck ?? {}) as Record<string, unknown>;
    const lineups = (parsed.lineups ?? {}) as Record<string, unknown>;
    const value: MatchBriefDto = {
      verdict: oneOf(parsed.verdict, VERDICTS) ?? (match.bestBet ? 'caution' : 'no_bet'),
      summary:
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim()
          : answer.text.trim().slice(0, 600),
      warnings: textList(parsed.warnings, 6),
      betCheck: {
        status: oneOf(betCheck.status, ['ok', 'check'] as const) ?? 'check',
        reason: typeof betCheck.reason === 'string' ? betCheck.reason.trim() : '',
      },
      lineups: { team1: textList(lineups.team1, 7), team2: textList(lineups.team2, 7) },
      sources: answer.sources.slice(0, 8),
      searched: answer.searched,
      model: credentials.model,
      createdAt: new Date().toISOString(),
    };

    this.briefs.set(key, { at: Date.now(), value });
    return value;
  }

  async draft(userId: string, input: PurchaseDraftInputDto): Promise<PurchaseDraftDto> {
    if (!input.image && !input.url && !input.text) {
      throw new BadRequestException('Пришли скриншот, ссылку или текст');
    }

    const lot = input.url?.match(CSFLOAT_ITEM)?.[1];

    if (lot && this.csfloat.isEnabled) {
      const listing = await this.csfloat.listing(lot).catch((error: unknown) => {
        if (error instanceof CsfloatPausedError) {
          const minutes = Math.max(1, Math.ceil((error.until - Date.now()) / 60_000));

          throw new ServiceUnavailableException(
            `CSFloat исчерпал лимит запросов, ссылка заработает через ${minutes} мин. Пока можно прислать скриншот`,
          );
        }

        throw error;
      });

      return this.describe({
        name: listing.name,
        price: listing.price,
        float: listing.float,
        paintSeed: listing.paintSeed,
        stickers: listing.stickers,
        market: 'csfloat',
        image: listing.image,
      });
    }

    const credentials = await this.assistant.credentials(userId);
    const answer = await this.client.ask(credentials, {
      system: DRAFT_SYSTEM,
      prompt: [
        input.url ? `Listing link: ${input.url}` : null,
        input.text ? `Text: ${input.text}` : null,
        input.image ? 'The screenshot is attached.' : null,
      ]
        .filter(Boolean)
        .join('\n'),
      images: input.image ? [input.image] : [],
      fetchLinks: !!input.url,
    });
    const parsed = extractJson<Record<string, unknown>>(answer.text) ?? {};
    const dollars = positiveNumber(parsed.price);
    const float = positiveNumber(parsed.float);
    const seed = positiveNumber(parsed.paintSeed);

    return this.describe({
      name: typeof parsed.name === 'string' ? parsed.name.trim() : null,
      price: dollars === undefined ? null : Math.round(dollars * 100),
      float: float !== undefined && float <= 1 ? float : null,
      paintSeed: seed !== undefined && Number.isInteger(seed) && seed <= 1000 ? seed : null,
      stickers: textList(parsed.stickers, 6),
      market: oneOf(parsed.market, PURCHASE_MARKETS) ?? null,
      image: null,
    });
  }

  async search(userId: string, query: string): Promise<SmartSearchDto> {
    const credentials = await this.assistant.credentials(userId);
    const answer = await this.client.ask(credentials, { system: SEARCH_SYSTEM, prompt: query });
    const parsed = extractJson<Record<string, unknown>>(answer.text) ?? {};
    const minPrice = positiveNumber(parsed.minPrice);
    const maxPrice = positiveNumber(parsed.maxPrice);

    return {
      q:
        typeof parsed.q === 'string' && parsed.q.trim()
          ? parsed.q.replace(/★/g, '').trim()
          : undefined,
      category: oneOf(parsed.category, CATEGORIES),
      wear: oneOf(parsed.wear, WEARS),
      edition: oneOf(parsed.edition, EDITIONS),
      phase: oneOf(parsed.phase, MARKET_PHASES),
      minPrice,
      maxPrice: maxPrice !== undefined && maxPrice > 0 ? maxPrice : undefined,
      sort: oneOf(parsed.sort, SORTS),
      note: typeof parsed.note === 'string' && parsed.note.trim() ? parsed.note.trim() : undefined,
    };
  }

  private resolveName(name: string | null): string | null {
    if (!name) return null;
    if (this.board.find(name)) return name;

    const wanted = name.toLowerCase().replace(/\s+/g, ' ').trim();

    return this.board.all().find((item) => item.name.toLowerCase() === wanted)?.name ?? null;
  }

  private describe(draft: {
    name: string | null;
    price: number | null;
    float: number | null;
    paintSeed: number | null;
    stickers: string[];
    market: string | null;
    image: string | null;
  }): PurchaseDraftDto {
    const known = this.resolveName(draft.name);
    const meta = known ? this.catalog.get(known) : undefined;

    return {
      name: known ?? draft.name,
      known: known !== null,
      image: meta?.image ?? draft.image,
      rarityColor: meta?.rarityColor ?? null,
      price: draft.price,
      float: draft.float,
      paintSeed: draft.paintSeed,
      stickers: draft.stickers.map((sticker) => this.resolveName(sticker) ?? sticker),
      market: draft.market,
    };
  }
}

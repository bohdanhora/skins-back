import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { extractJson, oneOf, positiveNumber, textList } from '../../domain/assistant-providers';
import { searchCandidates, type SearchRow } from '../../domain/assistant-search';
import { findFloatDeals, type FloatLot } from '../../domain/float-deals';
import { blueShare } from '../../domain/blue-gem';
import { fadeShare } from '../../domain/fade';
import { MARKET_PHASES, parseVariantName } from '../../domain/market-variant';
import { median, similarFloatSales } from '../../domain/similar-sales';
import { BettingService } from '../betting/betting.service';
import type { MatchForecastDto, MarketOfferDto } from '../betting/dto/betting.dto';
import { CatalogService } from '../catalog/catalog.service';
import { BlueGemService } from '../items/blue-gem.service';
import { BlueValueService } from '../items/blue-value.service';
import { FloatSearchService } from '../items/float-search.service';
import { ItemIndexService } from '../items/item-index.service';
import { ItemsService } from '../items/items.service';
import { DEFAULT_FEE_PERCENT } from '../items/dto/items-query.dto';
import { CsfloatClient, CsfloatPausedError } from '../csfloat/csfloat.client';
import { PriceBoardService } from '../prices/price-board.service';
import { SalesHistoryService } from '../prices/sales-history.service';
import { AssistantService } from './assistant.service';
import type {
  BluePickDto,
  BluePicksDto,
  BluePicksInputDto,
  FloatPicksDto,
  FloatPicksInputDto,
  AnalyzedLotDto,
  ItemAnalysisDto,
  ItemAnalysisInputDto,
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
const MAX_CANDIDATES = 250;
const BLUE_CANDIDATES = 8;
const BLUE_PICKS = 5;
const FLOOR_MULTIPLE = 3;
const BLUE_PICKS_TTL_MS = 30 * 60_000;
const FLOAT_PICKS = 5;
const DEFAULT_DMARKET_FEE = 5;
const MAX_PICKS = 12;
const ANALYSIS_TTL_MS = 10 * 60_000;
const ANALYSIS_VERDICTS = ['buy', 'consider', 'skip'] as const;
const FLOAT_WINDOW = 0.02;
const NEAR_LISTINGS = 6;
const RECENT_SALES = 8;
const DAY_MS = 86_400_000;

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

const PICK_SYSTEM = `You pick CS2 skins for a trader from a list of real items that are on sale right now.
Rules:
- Choose only names from the list, copied exactly. Never add anything that is not in the list.
- Keep only items that satisfy every part of the request: knife or weapon type, finish, phase, wear, edition, price.
- If the request asks for the best or most worthwhile option, prefer items that sell often at a sensible price. Otherwise rank by how well they fit.
- Give at most 12 picks, fewer is fine. The reason is at most 15 words in Russian and may only use facts from the list: price, lots on sale, recent sales.
- If nothing in the list fits, return an empty list and explain in the note.
Answer with a single JSON object and nothing else:
{"picks":[{"name":"exact name from the list","reason":"..."}],"note":"in Russian, only when something important must be said"}`;

const BLUE_SYSTEM = `You explain Case Hardened blue gem listings to a CS2 trader.
Every number comes from the JSON you are given: price, blue share, the estimate from similar recent CSFloat sales, how many similar sales it rests on and the margin. Never invent or change numbers.
For each listing write one short honest sentence in Russian: why it is worth a look or what the catch is (few similar sales, blue by calculator only, estimate barely above the price).
Then one or two sentences of summary. If nothing is clearly underpriced, say so plainly.
Answer with a single JSON object and nothing else:
{"reasons":{"<id>":"..."},"summary":"..."}`;

const FLOAT_SYSTEM = `You explain CS2 skin listings found by float to a trader.
Every number comes from the JSON you are given: price, float, the cheapest listing with a worse float, the saving against them, and the best DMarket buy order that accepts this float with the profit after the fee. Never invent or change numbers.
For each listing write one short honest sentence in Russian: why it is worth a look or what the catch is (the saving rests on few listings, the order may vanish, the float gain is tiny).
Then one or two sentences of summary.
Answer with a single JSON object and nothing else:
{"reasons":{"<index>":"..."},"summary":"..."}`;

const ANALYSIS_SYSTEM = `You judge one CS2 skin purchase for a trader who buys to resell or to hold value.
Every number comes from the JSON you are given: the lot (price, float, pattern, fade or blue share, stickers), prices on every market, the discount against usual sales, liquidity, CSFloat sales of items with a similar float, listings with a similar float, buy orders that accept this float and the resale results after fees. Never invent or change numbers, never assume facts that are not in the JSON.
How to judge:
- The lot is good when it costs less than similar floats and patterns sell for, sells often, and can be resold after fees or covered by a buy order.
- A float or pattern premium only counts if similar sales or buy orders show that buyers pay for it.
- Few sales, a wide price spread, a falling trend, or a price above the cheapest similar listing lower the score.
- If data is missing, say so and keep the score near the middle.
Score 1-100 is the chance the purchase pays off: 80+ clear bargain, 60-79 good, 40-59 fair price with no edge, below 40 overpaid or risky.
Write in Russian, short and concrete, with numbers from the JSON in dollars.
Answer with a single JSON object and nothing else:
{"score":55,"verdict":"buy|consider|skip","summary":"2-3 sentences","pros":["..."],"cons":["..."]}
At most 4 pros and 4 cons, each under 15 words.`;

const usd = (cents: number | null | undefined): number | null =>
  cents === null || cents === undefined ? null : cents / 100;

const clampScore = (value: unknown): number | null => {
  const score = typeof value === 'number' ? value : Number(value);

  return Number.isFinite(score) ? Math.min(100, Math.max(1, Math.round(score))) : null;
};

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
  private readonly bluePicksCache = new Map<
    string,
    { at: number; value: { picks: BluePickDto[]; checked: number } }
  >();

  constructor(
    private readonly assistant: AssistantService,
    private readonly client: ModelClientService,
    private readonly betting: BettingService,
    private readonly csfloat: CsfloatClient,
    private readonly board: PriceBoardService,
    private readonly catalog: CatalogService,
    private readonly index: ItemIndexService,
    private readonly sales: SalesHistoryService,
    private readonly blueGems: BlueGemService,
    private readonly blueValues: BlueValueService,
    private readonly floats: FloatSearchService,
    private readonly items: ItemsService,
  ) {}

  private readonly analyses = new Map<string, { at: number; value: ItemAnalysisDto }>();

  async analyzeItem(userId: string, input: ItemAnalysisInputDto): Promise<ItemAnalysisDto> {
    const fees = {
      feeWhiteMarket: input.feeWhiteMarket ?? DEFAULT_FEE_PERCENT,
      feeDmarket: input.feeDmarket ?? DEFAULT_FEE_PERCENT,
      feeCsfloat: input.feeCsfloat ?? DEFAULT_FEE_PERCENT,
    };
    const key = [userId, input.name, fees.feeWhiteMarket, fees.feeDmarket, fees.feeCsfloat].join(
      '|',
    );
    const cached = this.analyses.get(key);
    const refresh = input.refresh === true || input.refresh === 'true';

    if (!refresh && cached && Date.now() - cached.at < ANALYSIS_TTL_MS) return cached.value;

    const credentials = await this.assistant.credentials(userId);
    const view = await this.items.get(input.name, fees);
    const listings = await this.items.listingsFor(input.name).catch(() => null);
    const offerMarket = view.top?.market ?? null;
    const cheapest = (listings?.listings ?? [])
      .filter((listing) => !offerMarket || listing.market === offerMarket)
      .sort((left, right) => left.price - right.price)[0];
    const lotFloat = cheapest?.float ? Number(cheapest.float) : null;
    const lot: AnalyzedLotDto | null = cheapest
      ? {
          market: cheapest.market,
          price: cheapest.price,
          float: lotFloat !== null && Number.isFinite(lotFloat) ? lotFloat : null,
          paintSeed: cheapest.paintSeed,
          fade: fadeShare(input.name, cheapest.paintSeed)?.percentage ?? null,
          blue: blueShare(input.name, cheapest.paintSeed)?.playside ?? null,
          url: cheapest.url,
        }
      : null;
    const { marketHashName } = parseVariantName(input.name);
    const [sales, nearFloat, blueValue] = await Promise.all([
      this.csfloat.isEnabled
        ? this.csfloat.fetchRecentSales(marketHashName).catch(() => [])
        : Promise.resolve([]),
      lot?.float !== null && lot?.float !== undefined
        ? this.floats
            .search({
              name: input.name,
              floatFrom: Math.max(0, lot.float - FLOAT_WINDOW),
              floatTo: Math.min(1, lot.float + FLOAT_WINDOW),
            })
            .catch(() => null)
        : Promise.resolve(null),
      lot?.blue !== null && lot?.blue !== undefined && lot.paintSeed !== null
        ? this.blueValues.value(input.name, lot.paintSeed).catch(() => null)
        : Promise.resolve(null),
    ]);
    const similarSales =
      lot?.float !== null && lot?.float !== undefined ? similarFloatSales(sales, lot.float) : null;
    const nearListings = nearFloat
      ? [nearFloat.dmarket, nearFloat.whiteMarket, nearFloat.csfloat]
          .flatMap((source) => source.listings)
          .sort((left, right) => left.price - right.price)
      : [];
    const acceptingOrders = (nearFloat?.orders ?? []).filter(
      (order) =>
        lot?.float !== null &&
        lot?.float !== undefined &&
        (!order.range || (lot.float >= order.range[0] && lot.float < order.range[1])),
    );
    const now = Date.now();
    const facts = {
      item: input.name,
      category: view.category,
      phase: view.phase,
      lot: lot && {
        market: lot.market,
        priceUsd: usd(lot.price),
        float: lot.float,
        pattern: lot.paintSeed,
        fadePercent: lot.fade,
        blueSharePlayside: lot.blue,
        stickers: cheapest?.stickers.map((sticker) => ({
          name: sticker.name,
          wear: sticker.wear,
          priceUsd: usd(sticker.price),
        })),
        stickersValueUsd: usd(cheapest?.stickersValue),
      },
      marketPrices: Object.fromEntries(
        (['whiteMarket', 'dmarket', 'csfloat', 'lisSkins'] as const).map((market) => [
          market,
          view[market]
            ? { priceUsd: usd(view[market].price), listings: view[market].listings }
            : null,
        ]),
      ),
      dmarketBestBuyOrderUsd: usd(view.dmarket?.bid),
      topOffer: view.top && {
        market: view.top.market,
        priceUsd: usd(view.top.price),
        usualPriceUsd: usd(view.top.reference),
        discountPercent: view.top.percent,
        buyOrderCoverPercent: view.top.bidCover,
      },
      dmarketSales: view.sales && {
        weekSales: view.sales.weekSales,
        eightWeekSales: view.sales.eightWeekSales,
        eightWeekAverageUsd: usd(view.sales.eightWeekAverage),
        usualFloorUsd: usd(view.sales.floor),
        weekTrendPercent: view.sales.trendPercent,
      },
      csfloatRecentSales: sales.length
        ? {
            count: sales.length,
            medianUsd: usd(median(sales.map((sale) => sale.price))),
            similarFloat: similarSales && {
              count: similarSales.count,
              floatRange: similarSales.floatRange,
              medianUsd: usd(similarSales.median),
              lowUsd: usd(similarSales.low),
              highUsd: usd(similarSales.high),
            },
            nearestByFloat:
              lot?.float !== null && lot?.float !== undefined
                ? [...sales]
                    .sort(
                      (left, right) =>
                        Math.abs(left.float - lot.float!) - Math.abs(right.float - lot.float!),
                    )
                    .slice(0, RECENT_SALES)
                    .map((sale) => ({
                      priceUsd: usd(sale.price),
                      float: Math.round(sale.float * 10_000) / 10_000,
                      pattern: sale.paintSeed,
                      fadePercent: fadeShare(input.name, sale.paintSeed)?.percentage ?? null,
                      daysAgo: Math.round((now - Date.parse(sale.soldAt)) / DAY_MS),
                    }))
                : [],
          }
        : null,
      listingsWithSimilarFloat: nearListings.slice(0, NEAR_LISTINGS).map((listing) => ({
        market: listing.market,
        priceUsd: usd(listing.price),
        float: listing.float,
      })),
      buyOrdersForThisFloat: acceptingOrders.slice(0, 3).map((order) => ({
        priceUsd: usd(order.price),
        amount: order.amount,
        floatRange: order.range,
      })),
      blueGemEstimate: blueValue && {
        estimateUsd: usd(blueValue.estimate),
        similarSales: blueValue.comparableCount,
      },
      resale: {
        listElsewhereAfterFees: view.flip && {
          buyOn: view.flip.buyOn,
          sellOn: view.flip.sellOn,
          profitUsd: usd(view.flip.profit),
          percent: view.flip.percent,
        },
        sellToBuyOrderAfterFees: view.instant && {
          profitUsd: usd(view.instant.profit),
          percent: view.instant.percent,
        },
      },
      sellerFeesPercent: fees,
    };
    const answer = await this.client.ask(credentials, {
      system: ANALYSIS_SYSTEM,
      prompt: JSON.stringify(facts),
    });
    const parsed = extractJson<Record<string, unknown>>(answer.text) ?? {};
    const score = clampScore(parsed.score) ?? 50;
    const value: ItemAnalysisDto = {
      score,
      verdict:
        oneOf(parsed.verdict, ANALYSIS_VERDICTS) ??
        (score >= 60 ? 'buy' : score >= 40 ? 'consider' : 'skip'),
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
      pros: textList(parsed.pros, 4),
      cons: textList(parsed.cons, 4),
      lot,
      similarSales,
      analyzedAt: new Date().toISOString(),
    };

    this.analyses.set(key, { at: Date.now(), value });

    return value;
  }

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
    const filters: SmartSearchDto = {
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
    const candidates = searchCandidates(this.searchRows(), filters, MAX_CANDIDATES);

    if (candidates.length === 0) {
      return { ...filters, picks: [] };
    }

    const list = candidates
      .map((row) => {
        const sales = this.sales.get(row.name);

        return `${row.name} | $${((row.price ?? 0) / 100).toFixed(2)} | ${row.listings} lots | ${sales?.eightWeekSales ?? 0} sales in 8 weeks`;
      })
      .join('\n');
    const picked = await this.client.ask(credentials, {
      system: PICK_SYSTEM,
      prompt: `Request: ${query}\n\nCandidates (name | cheapest price | lots on sale | recent sales):\n${list}`,
    });
    const choice = extractJson<{ picks?: unknown; note?: unknown }>(picked.text) ?? {};
    const byName = new Map(candidates.map((row) => [row.name, row]));
    const picks = (Array.isArray(choice.picks) ? choice.picks : [])
      .flatMap((entry): { name: string; reason: string; price: number | null }[] => {
        const pick = entry as { name?: unknown; reason?: unknown };
        const row = typeof pick.name === 'string' ? byName.get(pick.name.trim()) : undefined;

        return row
          ? [
              {
                name: row.name,
                reason: typeof pick.reason === 'string' ? pick.reason.trim() : '',
                price: row.price,
              },
            ]
          : [];
      })
      .filter((pick, index, all) => all.findIndex((entry) => entry.name === pick.name) === index)
      .slice(0, MAX_PICKS);

    return {
      ...filters,
      picks,
      note:
        typeof choice.note === 'string' && choice.note.trim() ? choice.note.trim() : filters.note,
    };
  }

  async bluePicks(userId: string, input: BluePicksInputDto): Promise<BluePicksDto> {
    const key = `${input.weapon}|${input.wear ?? ''}`;
    const cached = this.bluePicksCache.get(key);
    let ranked = cached?.value;

    if (!cached || Date.now() - cached.at >= BLUE_PICKS_TTL_MS) {
      ranked = await this.rankBlue(input);
      this.bluePicksCache.set(key, { at: Date.now(), value: ranked });
    }

    const { picks, checked } = ranked!;
    const csfloatPausedUntil = this.csfloat.quota().pausedUntil;
    const credentials =
      picks.length > 0 ? await this.assistant.credentials(userId).catch(() => null) : null;

    if (!credentials) {
      return { picks, summary: null, checked, csfloatPausedUntil };
    }

    const answer = await this.client.ask(credentials, {
      system: BLUE_SYSTEM,
      prompt: JSON.stringify(
        picks.map((pick) => ({
          id: pick.id,
          name: pick.name,
          pattern: pick.paintSeed,
          bluePercent: pick.blue.playside,
          blueSource: pick.source,
          priceUsd: pick.price / 100,
          estimateUsd: pick.estimate / 100,
          marginUsd: pick.margin / 100,
          similarSales: pick.comparableCount,
        })),
      ),
    });
    const parsed =
      extractJson<{ reasons?: Record<string, unknown>; summary?: unknown }>(answer.text) ?? {};

    return {
      picks: picks.map((pick) => ({
        ...pick,
        reason:
          typeof parsed.reasons?.[pick.id] === 'string'
            ? (parsed.reasons[pick.id] as string).trim()
            : '',
      })),
      summary:
        typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : null,
      checked,
      csfloatPausedUntil,
    };
  }

  async floatPicks(userId: string, input: FloatPicksInputDto): Promise<FloatPicksDto> {
    const search = await this.floats.search({
      name: input.name,
      floatFrom: input.floatFrom,
      floatTo: input.floatTo,
    });
    const lots: FloatLot[] = [
      ...[search.dmarket, search.whiteMarket, search.csfloat].flatMap((source) =>
        source.listings.flatMap((listing) =>
          listing.float !== null
            ? [
                {
                  market: listing.market,
                  price: listing.price,
                  float: listing.float,
                  paintSeed: listing.paintSeed,
                  url: listing.url,
                },
              ]
            : [],
        ),
      ),
      ...search.steam.listings.flatMap((listing) =>
        listing.float !== null && listing.price !== null
          ? [
              {
                market: 'steam',
                price: listing.price,
                float: listing.float,
                paintSeed: listing.paintSeed,
                url: listing.url,
              },
            ]
          : [],
      ),
    ];
    const deals = findFloatDeals(
      lots,
      search.orders,
      input.feeDmarket ?? DEFAULT_DMARKET_FEE,
      FLOAT_PICKS,
    );
    const csfloatPausedUntil = this.csfloat.quota().pausedUntil;
    const picks = deals.map((deal) => ({
      market: deal.market,
      price: deal.price,
      float: deal.float,
      paintSeed: deal.paintSeed,
      url: deal.url,
      worseCheapest: deal.worseCheapest,
      saving: deal.saving,
      orderPrice: deal.orderPrice,
      orderProfit: deal.orderProfit,
      reason: '',
    }));
    const credentials =
      picks.length > 0 ? await this.assistant.credentials(userId).catch(() => null) : null;

    if (!credentials) {
      return { picks, summary: null, checked: lots.length, csfloatPausedUntil };
    }

    const answer = await this.client.ask(credentials, {
      system: FLOAT_SYSTEM,
      prompt: JSON.stringify({
        item: input.name,
        listings: picks.map((pick, index) => ({
          index,
          market: pick.market,
          float: pick.float,
          priceUsd: pick.price / 100,
          cheapestWorseFloatUsd: pick.worseCheapest === null ? null : pick.worseCheapest / 100,
          savingUsd: pick.saving / 100,
          buyOrderUsd: pick.orderPrice === null ? null : pick.orderPrice / 100,
          buyOrderProfitUsd: pick.orderProfit === null ? null : pick.orderProfit / 100,
        })),
      }),
    });
    const parsed =
      extractJson<{ reasons?: Record<string, unknown>; summary?: unknown }>(answer.text) ?? {};

    return {
      picks: picks.map((pick, index) => {
        const reason = parsed.reasons?.[String(index)];

        return { ...pick, reason: typeof reason === 'string' ? reason.trim() : '' };
      }),
      summary:
        typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : null,
      checked: lots.length,
      csfloatPausedUntil,
    };
  }

  private async rankBlue(
    input: BluePicksInputDto,
  ): Promise<{ picks: BluePickDto[]; checked: number }> {
    const search = await this.blueGems.search({ weapon: input.weapon, wear: input.wear });
    const seen = new Set<string>();
    const candidates = search.listings
      .filter((listing) => listing.price !== null && listing.price > 0)
      .filter(
        (listing) =>
          listing.floorPrice === null || listing.price! <= listing.floorPrice * FLOOR_MULTIPLE,
      )
      .filter((listing) => {
        const key = `${listing.name}|${listing.paintSeed}`;

        if (seen.has(key)) return false;

        seen.add(key);
        return true;
      })
      .slice(0, BLUE_CANDIDATES);
    const valued: BluePickDto[] = [];

    for (const listing of candidates) {
      const value = await this.blueValues.value(listing.name, listing.paintSeed).catch(() => null);

      if (!value || value.estimate === null || value.multiplier === null) continue;

      valued.push({
        market: listing.market,
        id: listing.id,
        name: listing.name,
        price: listing.price!,
        float: listing.float,
        paintSeed: listing.paintSeed,
        blue: value.blue,
        url: listing.url,
        estimate: value.estimate,
        margin: value.estimate - listing.price!,
        multiplier: value.multiplier,
        comparableCount: value.comparableCount,
        source: value.source,
        reason: '',
      });
    }

    const picks = valued
      .filter((pick) => pick.margin > 0)
      .sort((left, right) => right.margin - left.margin)
      .slice(0, BLUE_PICKS);

    return { picks, checked: candidates.length };
  }

  private searchRows(): SearchRow[] {
    return this.index.all().map((item) => {
      const quotes = [item.whiteMarket, item.dmarket, item.csfloat].filter(
        (quote) => quote && quote.listings > 0 && quote.price !== null,
      );

      return {
        name: item.name,
        searchName: item.searchName,
        category: item.category,
        phase: item.phase,
        price: quotes.length > 0 ? Math.min(...quotes.map((quote) => quote!.price!)) : null,
        listings: quotes.reduce((sum, quote) => sum + quote!.listings, 0),
      };
    });
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

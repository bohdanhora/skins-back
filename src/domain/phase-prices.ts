import { liveOrders, type DepthOffer, type DepthOrder } from './float-snipes';
import { type DailySales } from './sales';
import {
  MARKET_PHASES,
  isCommonDopplerPhase,
  normalizeMarketPhase,
  type MarketPhase,
} from './market-variant';

export interface PhaseQuote {
  price: number | null;
  listings: number;
  bid: number | null;
  bids: number;
}

export interface PhaseQuotes {
  common: PhaseQuote;
  phases: Map<MarketPhase, PhaseQuote>;
}

const DOPPLER_FAMILY = /\| (Gamma )?Doppler \(/;

export const COMMON_DOPPLER_PHASES = MARKET_PHASES.filter(isCommonDopplerPhase);

export const hasDopplerPhases = (marketHashName: string): boolean =>
  DOPPLER_FAMILY.test(marketHashName);

const isUnconditional = (order: DepthOrder): boolean =>
  order.floatPart === null && order.paintSeed === null;

const quoteOf = (offers: DepthOffer[], orders: DepthOrder[]): PhaseQuote => {
  const prices = offers.map((offer) => offer.price).filter((price) => price > 0);
  const bids = orders.filter((order) => order.price > 0);

  return {
    price: prices.length > 0 ? Math.min(...prices) : null,
    listings: prices.length,
    bid: bids.length > 0 ? Math.max(...bids.map((order) => order.price)) : null,
    bids: bids.reduce((sum, order) => sum + order.amount, 0),
  };
};

export const summarizeDepth = (offers: DepthOffer[], orders: DepthOrder[]): PhaseQuote =>
  quoteOf(
    offers,
    liveOrders(offers, orders).filter((order) => isUnconditional(order) && order.phase === null),
  );

export const summarizePhaseDepth = (offers: DepthOffer[], orders: DepthOrder[]): PhaseQuotes => {
  const unconditional = liveOrders(offers, orders).filter(isUnconditional);
  const anyPhase = unconditional.filter((order) => order.phase === null);
  const phases = new Map<MarketPhase, PhaseQuote>();

  for (const phase of MARKET_PHASES) {
    const phaseOffers = offers.filter((offer) => normalizeMarketPhase(offer.phase) === phase);
    const phaseOrders = unconditional.filter(
      (order) => order.phase === null || normalizeMarketPhase(order.phase) === phase,
    );
    const quote = quoteOf(phaseOffers, phaseOrders);

    if (quote.listings > 0 || phaseOrders.some((order) => order.phase !== null)) {
      phases.set(phase, quote);
    }
  }

  const commonOffers = offers.filter((offer) => {
    const phase = normalizeMarketPhase(offer.phase);

    return phase !== null && isCommonDopplerPhase(phase);
  });

  return { common: quoteOf(commonOffers, anyPhase), phases };
};

export const mergeDailySales = (series: DailySales[][]): DailySales[] => {
  const byDay = new Map<string, { total: number; count: number }>();

  for (const entry of series.flat()) {
    if (entry.count <= 0) {
      continue;
    }

    const current = byDay.get(entry.day) ?? { total: 0, count: 0 };

    byDay.set(entry.day, {
      total: current.total + entry.average * entry.count,
      count: current.count + entry.count,
    });
  }

  return [...byDay]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, { total, count }]) => ({ day, average: Math.round(total / count), count }));
};

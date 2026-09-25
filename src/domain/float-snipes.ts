import { DMARKET_FLOAT_PARTS, inRange } from './float';

/** One listing from the DMarket order book. Money in cents. */
export interface DepthOffer {
  price: number;
  float: number | null;
  paintSeed: number | null;
  /** Doppler and Gamma Doppler phase, e.g. "ruby". */
  phase: string | null;
}

/** One buy order level. A null condition means "any". */
export interface DepthOrder {
  price: number;
  amount: number;
  floatPart: string | null;
  paintSeed: number | null;
  phase: string | null;
}

export type SnipeSource = 'dmarket' | 'whiteMarket';

/**
 * A listing that already fits a buy order paying more than the listing costs:
 * buy it and hand it straight to that order.
 */
export interface FloatSnipe {
  source: SnipeSource;
  listingPrice: number;
  float: number | null;
  paintSeed: number | null;
  phase: string | null;
  orderPrice: number;
  orderAmount: number;
  /** What the order asks for, so the UI can explain why it pays more. */
  orderFloatPart: string | null;
  orderPaintSeed: number | null;
  orderPhase: string | null;
}

const MAX_SNIPES_PER_ITEM = 5;

/**
 * An order accepts a listing only when every condition it sets is met.
 * Unknown listing details (null) never satisfy a condition.
 */
export const orderAccepts = (order: DepthOrder, offer: DepthOffer): boolean => {
  if (order.floatPart) {
    const range = DMARKET_FLOAT_PARTS[order.floatPart];

    if (!range || offer.float === null || !inRange(offer.float, range[0], range[1])) {
      return false;
    }
  }

  if (order.paintSeed !== null && order.paintSeed !== offer.paintSeed) {
    return false;
  }

  return order.phase === null || order.phase === offer.phase;
};

/** A listing to check, from either market. */
export interface SnipeCandidate extends DepthOffer {
  source: SnipeSource;
}

/**
 * Listings that some buy order would take for more than they cost, best gap first.
 * An order for N items can only absorb N listings: the cheapest listings claim
 * the best paying orders first, so one order is never promised twice.
 */
export const findSnipes = (candidates: SnipeCandidate[], orders: DepthOrder[]): FloatSnipe[] => {
  const remaining = new Map(orders.map((order) => [order, order.amount]));
  const byPrice = [...orders].sort((left, right) => right.price - left.price);
  const snipes: FloatSnipe[] = [];

  for (const offer of [...candidates].sort((left, right) => left.price - right.price)) {
    const order = byPrice.find(
      (candidate) =>
        candidate.price > offer.price &&
        (remaining.get(candidate) ?? 0) > 0 &&
        orderAccepts(candidate, offer),
    );

    if (!order) {
      continue;
    }

    remaining.set(order, (remaining.get(order) ?? 0) - 1);
    snipes.push({
      source: offer.source,
      listingPrice: offer.price,
      float: offer.float,
      paintSeed: offer.paintSeed,
      phase: offer.phase,
      orderPrice: order.price,
      orderAmount: order.amount,
      orderFloatPart: order.floatPart,
      orderPaintSeed: order.paintSeed,
      orderPhase: order.phase,
    });
  }

  return snipes
    .sort(
      (left, right) =>
        right.orderPrice - right.listingPrice - (left.orderPrice - left.listingPrice),
    )
    .slice(0, MAX_SNIPES_PER_ITEM);
};

/** Seller fee is taken from what the order pays. */
export const snipeProfit = (snipe: FloatSnipe, dmarketFee: number): number =>
  Math.floor(snipe.orderPrice * (1 - dmarketFee)) - snipe.listingPrice;

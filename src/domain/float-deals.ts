export interface FloatLot {
  market: string;
  price: number;
  float: number;
  paintSeed: number | null;
  url: string;
}

export interface FloatOrder {
  price: number;
  range: [number, number] | null;
}

export interface FloatDeal extends FloatLot {
  worseCheapest: number | null;
  saving: number;
  orderPrice: number | null;
  orderProfit: number | null;
  score: number;
}

const MIN_WORSE = 3;
const MIN_SAVING_SHARE = 0.02;

export const findFloatDeals = (
  lots: FloatLot[],
  orders: FloatOrder[],
  sellerFeePercent: number,
  limit: number,
): FloatDeal[] => {
  const ordered = [...lots].sort((left, right) => left.float - right.float);

  return ordered
    .map((lot, index): FloatDeal => {
      const worse = ordered
        .slice(index + 1)
        .filter((other) => other.float > lot.float)
        .map((other) => other.price);
      const worseCheapest = worse.length >= MIN_WORSE ? Math.min(...worse) : null;
      const gap = worseCheapest === null ? 0 : worseCheapest - lot.price;
      const saving = gap >= lot.price * MIN_SAVING_SHARE ? gap : 0;
      const covering = orders
        .filter(
          (order) => order.range && order.range[0] <= lot.float && lot.float <= order.range[1],
        )
        .map((order) => order.price);
      const orderPrice = covering.length > 0 ? Math.max(...covering) : null;
      const orderProfit =
        orderPrice === null
          ? null
          : Math.floor(orderPrice * (1 - sellerFeePercent / 100)) - lot.price;

      return {
        ...lot,
        worseCheapest,
        saving,
        orderPrice,
        orderProfit,
        score: Math.max(saving, orderProfit ?? 0),
      };
    })
    .filter((deal) => deal.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
};

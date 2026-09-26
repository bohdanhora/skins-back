import { type SalesStats, type TopOffer } from './sales';

export type DealConfidence = 'high' | 'medium' | 'low';

export interface DealScore {
  score: number;
  confidence: DealConfidence;
}

const RELIABLE_TREND_WEEK_SALES = 5;
const RELIABLE_TREND_SALES = 20;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const calculateDealScore = (
  top: TopOffer | null,
  sales: SalesStats | null,
  depth: number,
): DealScore | null => {
  if (!top || !sales) return null;

  const eightWeekSales = sales.eightWeekSales ?? sales.weekSales;
  const bidCover = Math.min(100, top.bidCover ?? 0);
  const percentPoints = clamp(top.percent * 1.2, 0, 30);
  const moneyPoints = clamp(Math.log10(top.discount / 10 + 1) * 7.5, 0, 20);
  const bidPoints = clamp(((bidCover - 80) / 20) * 20, 0, 20);
  const liquidityPoints = clamp(Math.log10(eightWeekSales + 1) * 8, 0, 20);
  const depthPoints = clamp(Math.log10(depth + 1) * 2.5, 0, 5);
  const trendPoints =
    sales.weekSales >= RELIABLE_TREND_WEEK_SALES && eightWeekSales >= RELIABLE_TREND_SALES
      ? clamp((sales.trendPercent ?? 0) / 3, -10, 5)
      : 0;
  const score = Math.round(
    clamp(
      percentPoints + moneyPoints + bidPoints + liquidityPoints + depthPoints + trendPoints,
      0,
      100,
    ),
  );
  const confidence: DealConfidence =
    eightWeekSales >= 40 && depth >= 5 ? 'high' : eightWeekSales >= 10 ? 'medium' : 'low';

  return { score, confidence };
};

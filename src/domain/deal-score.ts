import { type SalesStats, type TopOffer } from './sales';

export type DealConfidence = 'high' | 'medium' | 'low';

export interface DealScore {
  score: number;
  confidence: DealConfidence;
}

export const calculateDealScore = (
  top: TopOffer | null,
  sales: SalesStats | null,
  depth: number,
): DealScore | null => {
  if (!top || !sales) return null;

  const eightWeekSales = sales.eightWeekSales ?? sales.weekSales;
  const bidCover = top.bidCover ?? 0;
  const discountPoints = Math.min(35, top.percent * 1.5);
  const bidPoints = Math.max(0, Math.min(25, ((bidCover - 70) / 30) * 25));
  const liquidityPoints = Math.min(25, Math.log10(eightWeekSales + 1) * 10);
  const depthPoints = Math.min(10, Math.log10(depth + 1) * 4);
  const trendPoints = Math.max(-10, Math.min(5, (sales.trendPercent ?? 0) / 2));
  const score = Math.round(
    Math.max(
      0,
      Math.min(100, discountPoints + bidPoints + liquidityPoints + depthPoints + trendPoints),
    ),
  );
  const confidence: DealConfidence =
    eightWeekSales >= 40 && depth >= 5 ? 'high' : eightWeekSales >= 10 ? 'medium' : 'low';

  return { score, confidence };
};

import { type DepthOffer, type DepthOrder } from './float-snipes';
import {
  hasDopplerPhases,
  mergeDailySales,
  summarizeDepth,
  summarizePhaseDepth,
} from './phase-prices';

const offer = (price: number, phase: string): DepthOffer => ({
  price,
  float: 0.01,
  paintSeed: 1,
  phase,
});

const order = (price: number, phase: string | null, amount = 1): DepthOrder => ({
  price,
  amount,
  floatPart: null,
  paintSeed: null,
  phase,
});

describe('summarizePhaseDepth', () => {
  const offers = [
    offer(120_000, 'phase-3'),
    offer(118_000, 'phase-4'),
    offer(450_000, 'sapphire'),
    offer(460_000, 'sapphire'),
  ];
  const orders = [
    order(741_000, 'black-pearl'),
    order(400_000, 'sapphire', 2),
    order(100_000, null, 3),
    { ...order(130_000, null), floatPart: 'FN-0' },
  ];

  it('prices the plain item by common phases and ignores rare phase buy orders', () => {
    const { common } = summarizePhaseDepth(offers, orders);

    expect(common).toEqual({ price: 118_000, listings: 2, bid: 100_000, bids: 3 });
  });

  it('keeps every phase separate and lets any-phase orders buy each of them', () => {
    const { phases } = summarizePhaseDepth(offers, orders);

    expect(phases.get('sapphire')).toEqual({ price: 450_000, listings: 2, bid: 400_000, bids: 5 });
    expect(phases.get('black-pearl')).toEqual({
      price: null,
      listings: 0,
      bid: 741_000,
      bids: 4,
    });
    expect(phases.get('ruby')).toBeUndefined();
  });
});

describe('hasDopplerPhases', () => {
  it('matches Doppler and Gamma Doppler only', () => {
    expect(hasDopplerPhases('★ Karambit | Doppler (Factory New)')).toBe(true);
    expect(hasDopplerPhases('Glock-18 | Gamma Doppler (Minimal Wear)')).toBe(true);
    expect(hasDopplerPhases('AK-47 | Redline (Field-Tested)')).toBe(false);
  });
});

describe('mergeDailySales', () => {
  it('adds counts and weights the average by volume', () => {
    expect(
      mergeDailySales([
        [{ day: '2026-09-20', average: 1000, count: 1 }],
        [
          { day: '2026-09-20', average: 2000, count: 3 },
          { day: '2026-09-19', average: 500, count: 2 },
        ],
      ]),
    ).toEqual([
      { day: '2026-09-19', average: 500, count: 2 },
      { day: '2026-09-20', average: 1750, count: 4 },
    ]);
  });
});

describe('summarizeDepth', () => {
  it('takes the best live plain order as the bid', () => {
    expect(
      summarizeDepth(
        [offer(90, 'phase-1'), offer(95, 'phase-2')],
        [order(167, null, 20), order(71, null), order(80, 'phase-2')],
      ),
    ).toEqual({ price: 90, listings: 2, bid: 71, bids: 1 });
  });
});

import { DmarketRateLimiter } from './dmarket-rate-limiter';

const sync = {
  pricesRefreshMs: 0,
  catalogRefreshMs: 0,
  salesRefreshMs: 0,
  floatRefreshMs: 0,
  dmarketRequestsPerSecond: 20,
};

describe('DmarketRateLimiter', () => {
  it('spaces requests and lets interactive ones jump the background queue', async () => {
    const limiter = new DmarketRateLimiter(sync);
    const order: string[] = [];
    const started: number[] = [];
    const task = (label: string) => () => {
      order.push(label);
      started.push(Date.now());
      return Promise.resolve(label);
    };

    const background = [1, 2, 3].map((index) =>
      limiter.schedule(task(`background ${index}`), 'background'),
    );
    const interactive = limiter.schedule(task('interactive'));

    await Promise.all([...background, interactive]);

    expect(order).toEqual(['background 1', 'interactive', 'background 2', 'background 3']);
    started.slice(1).forEach((time, index) => {
      expect(time - started[index]).toBeGreaterThanOrEqual(45);
    });
  });

  it('passes errors through', async () => {
    const limiter = new DmarketRateLimiter(sync);

    await expect(limiter.schedule(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  });
});

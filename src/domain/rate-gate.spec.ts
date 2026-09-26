import { RateGate } from './rate-gate';

const NOW = Date.parse('2026-09-27T00:00:00Z');
const RESET = String(NOW / 1000 + 600);

describe('rate gate', () => {
  it('lets everything through while the quota is healthy', () => {
    const gate = new RateGate(40, 60_000);

    gate.record({ limit: '200', remaining: '150', reset: RESET }, 200, NOW);

    expect(gate.blockedUntil(true, NOW)).toBeNull();
    expect(gate.snapshot(NOW)).toMatchObject({ limit: 200, remaining: 150, pausedUntil: null });
  });

  it('keeps the last requests for the user', () => {
    const gate = new RateGate(40, 60_000);

    gate.record({ limit: '200', remaining: '30', reset: RESET }, 200, NOW);

    expect(gate.blockedUntil(true, NOW)).toBe(NOW + 600_000);
    expect(gate.blockedUntil(false, NOW)).toBeNull();
  });

  it('pauses everything until the reset after a 429', () => {
    const gate = new RateGate(40, 60_000);

    gate.record({ limit: '200', remaining: '0', reset: RESET }, 429, NOW);

    expect(gate.blockedUntil(false, NOW + 1000)).toBe(NOW + 600_000);
    expect(gate.snapshot(NOW).pausedUntil).toBe(new Date(NOW + 600_000).toISOString());
    expect(gate.blockedUntil(false, NOW + 600_000)).toBeNull();
  });

  it('pauses for a while when the reset time is unknown', () => {
    const gate = new RateGate(40, 60_000);

    gate.record({ limit: null, remaining: null, reset: null }, 429, NOW);

    expect(gate.blockedUntil(false, NOW)).toBe(NOW + 60_000);
  });

  it('understands a reset given in seconds from now', () => {
    const gate = new RateGate(40, 60_000);

    gate.record({ limit: '200', remaining: '0', reset: '120' }, 429, NOW);

    expect(gate.blockedUntil(false, NOW)).toBe(NOW + 120_000);
  });
});

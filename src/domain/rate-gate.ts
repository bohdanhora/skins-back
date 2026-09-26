export interface RateHeaders {
  limit: string | null;
  remaining: string | null;
  reset: string | null;
}

export interface RateSnapshot {
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
  pausedUntil: string | null;
}

const TOO_MANY_REQUESTS = 429;
const SECONDS_EPOCH_LIMIT = 10_000_000_000;

const toNumber = (value: string | null): number | null => {
  if (value === null || value.trim() === '') return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

const toTime = (value: string | null, now: number): number | null => {
  const parsed = toNumber(value);

  if (parsed === null) return null;
  if (parsed > SECONDS_EPOCH_LIMIT) return parsed;
  if (parsed > 1_000_000_000) return parsed * 1000;

  return now + parsed * 1000;
};

export class RateGate {
  private limit: number | null = null;
  private remaining: number | null = null;
  private resetAt: number | null = null;
  private pausedUntil: number | null = null;

  constructor(
    private readonly reserve: number,
    private readonly fallbackPauseMs: number,
  ) {}

  blockedUntil(background: boolean, now: number): number | null {
    if (this.resetAt !== null && now >= this.resetAt) {
      this.remaining = null;
      this.resetAt = null;
      this.pausedUntil = null;
    }

    if (this.pausedUntil !== null && now < this.pausedUntil) return this.pausedUntil;

    if (
      background &&
      this.remaining !== null &&
      this.remaining <= this.reserve &&
      this.resetAt !== null
    ) {
      return this.resetAt;
    }

    return null;
  }

  record(headers: RateHeaders, status: number, now: number): void {
    this.limit = toNumber(headers.limit) ?? this.limit;
    this.remaining = toNumber(headers.remaining) ?? this.remaining;
    this.resetAt = toTime(headers.reset, now) ?? this.resetAt;

    if (status === TOO_MANY_REQUESTS) {
      this.remaining = 0;
      this.pausedUntil =
        this.resetAt !== null && this.resetAt > now ? this.resetAt : now + this.fallbackPauseMs;
    }
  }

  snapshot(now: number): RateSnapshot {
    this.blockedUntil(false, now);

    return {
      limit: this.limit,
      remaining: this.remaining,
      resetAt: this.resetAt === null ? null : new Date(this.resetAt).toISOString(),
      pausedUntil: this.pausedUntil === null ? null : new Date(this.pausedUntil).toISOString(),
    };
  }
}

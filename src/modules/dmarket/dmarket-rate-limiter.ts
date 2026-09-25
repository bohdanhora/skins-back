import { Inject, Injectable } from '@nestjs/common';

import { syncConfig, type SyncConfig } from '../../config/app.config';

/** Interactive requests (someone is looking at the screen) go before background scans. */
export type RequestPriority = 'interactive' | 'background';

interface Pending {
  run: () => void;
}

/**
 * DMarket counts requests per second across all its endpoints. Every call to
 * api.dmarket.com goes through here, so three background scanners and the UI
 * never add up to more than the configured rate.
 */
@Injectable()
export class DmarketRateLimiter {
  private readonly queues: Record<RequestPriority, Pending[]> = {
    interactive: [],
    background: [],
  };
  private readonly intervalMs: number;
  private nextSlot = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(@Inject(syncConfig.KEY) sync: SyncConfig) {
    this.intervalMs = Math.ceil(1000 / sync.dmarketRequestsPerSecond);
  }

  schedule<T>(task: () => Promise<T>, priority: RequestPriority = 'interactive'): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queues[priority].push({ run: () => void task().then(resolve, reject) });
      this.pump();
    });
  }

  private pump(): void {
    if (this.timer) {
      return;
    }

    const next = this.queues.interactive.shift() ?? this.queues.background.shift();

    if (!next) {
      return;
    }

    const wait = Math.max(0, this.nextSlot - Date.now());

    this.timer = setTimeout(() => {
      this.timer = null;
      this.nextSlot = Date.now() + this.intervalMs;
      next.run();
      this.pump();
    }, wait);
  }
}

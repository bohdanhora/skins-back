import { Injectable, Logger } from '@nestjs/common';

import { fetchJson } from '../../common/http/fetch-json';

const NBU_USD_URL = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json';
const RATE_TTL_MS = 6 * 60 * 60_000;

interface RawNbuRate {
  cc?: string;
  rate?: number;
}

export const parseSteamAmount = (label: string): number | null => {
  const digits = label.replace(/[^\d.,]/g, '');

  if (!digits) return null;

  const lastComma = digits.lastIndexOf(',');
  const lastDot = digits.lastIndexOf('.');
  const decimalAt =
    lastComma >= 0 && lastDot >= 0
      ? Math.max(lastComma, lastDot)
      : lastComma >= 0 && digits.length - lastComma === 3
        ? lastComma
        : lastDot;
  const whole = (decimalAt >= 0 ? digits.slice(0, decimalAt) : digits).replace(/[.,]/g, '');
  const fraction = decimalAt >= 0 ? digits.slice(decimalAt + 1) : '';
  const amount = Number(`${whole || '0'}.${fraction || '0'}`);

  return Number.isFinite(amount) && amount > 0 ? amount : null;
};

export const steamPriceToUsdCents = (label: string, uahPerUsd: number | null): number | null => {
  const amount = parseSteamAmount(label);

  if (amount === null) return null;
  if (/\$|USD/.test(label)) return Math.round(amount * 100);
  if (/₴|UAH|грн/i.test(label) && uahPerUsd) return Math.round((amount / uahPerUsd) * 100);

  return null;
};

@Injectable()
export class ExchangeRateClient {
  private readonly logger = new Logger(ExchangeRateClient.name);
  private cached: { rate: number; at: number } | null = null;
  private loading: Promise<number | null> | null = null;

  async uahPerUsd(): Promise<number | null> {
    if (this.cached && Date.now() - this.cached.at < RATE_TTL_MS) {
      return this.cached.rate;
    }

    this.loading ??= fetchJson<RawNbuRate[]>(NBU_USD_URL, { retries: 1 })
      .then((rows) => {
        const rate = rows.find((row) => row.cc === 'USD')?.rate;

        if (!rate || !Number.isFinite(rate) || rate <= 0) {
          throw new Error('NBU returned no USD rate');
        }

        this.cached = { rate, at: Date.now() };

        return rate;
      })
      .catch((error: unknown) => {
        this.logger.warn(`UAH rate failed: ${String(error)}`);

        return this.cached?.rate ?? null;
      })
      .finally(() => {
        this.loading = null;
      });

    return this.loading;
  }
}

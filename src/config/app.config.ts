import { registerAs } from '@nestjs/config';

import { NodeEnvironment } from './environment';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export interface AppConfig {
  environment: NodeEnvironment;
  port: number;
  corsOrigins: string[];
  logLevel: string;
  isProduction: boolean;
  cacheDir: string;
}

export interface DatabaseConfig {
  url: string;
  ssl: boolean;
}

export interface AuthConfig {
  publicApiUrl: string;
  frontendUrl: string;
  sessionDays: number;
}

export interface SyncConfig {
  pricesRefreshMs: number;
  listingsRefreshMs: number;
  catalogRefreshMs: number;
  salesRefreshMs: number;
  floatRefreshMs: number;
  dmarketRequestsPerSecond: number;
}

export interface WhiteMarketConfig {
  partnerToken: string;
  isPartnerEnabled: boolean;
}

export interface DmarketConfig {
  publicKey: string;
  secretKey: string;
  isTradingEnabled: boolean;
}

export interface CsfloatConfig {
  apiKey: string;
  isEnabled: boolean;
}

const readSecret = (name: string): string => (process.env[name] ?? '').trim();

export const appConfig = registerAs<AppConfig>('app', () => {
  const environment = (process.env.NODE_ENV as NodeEnvironment) ?? NodeEnvironment.Development;

  return {
    environment,
    port: Number(process.env.PORT ?? 4100),
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3100')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    logLevel: process.env.LOG_LEVEL ?? 'info',
    isProduction: environment === NodeEnvironment.Production,
    cacheDir: process.env.CACHE_DIR ?? '.cache',
  };
});

export const databaseConfig = registerAs<DatabaseConfig>('database', () => ({
  url: readSecret('DATABASE_URL'),
  ssl: process.env.DATABASE_SSL === 'true',
}));

export const authConfig = registerAs<AuthConfig>('auth', () => ({
  publicApiUrl: (process.env.PUBLIC_API_URL ?? 'http://localhost:4100').replace(/\/+$/, ''),
  frontendUrl: (process.env.FRONTEND_URL ?? 'http://localhost:3100').replace(/\/+$/, ''),
  sessionDays: Number(process.env.SESSION_DAYS ?? 30),
}));

export const syncConfig = registerAs<SyncConfig>('sync', () => ({
  pricesRefreshMs: Number(process.env.PRICES_REFRESH_MINUTES ?? 5) * MINUTE_MS,
  listingsRefreshMs: Number(process.env.LISTINGS_REFRESH_MINUTES ?? 2) * MINUTE_MS,
  catalogRefreshMs: Number(process.env.CATALOG_REFRESH_HOURS ?? 24) * HOUR_MS,
  salesRefreshMs: Number(process.env.SALES_REFRESH_HOURS ?? 3) * HOUR_MS,
  floatRefreshMs: Number(process.env.FLOAT_REFRESH_HOURS ?? 2) * HOUR_MS,
  dmarketRequestsPerSecond: Number(process.env.DMARKET_REQUESTS_PER_SECOND ?? 10),
}));

export const whiteMarketConfig = registerAs<WhiteMarketConfig>('whiteMarket', () => {
  const partnerToken = readSecret('WHITE_MARKET_PARTNER_TOKEN');

  return { partnerToken, isPartnerEnabled: partnerToken.length > 0 };
});

export const dmarketConfig = registerAs<DmarketConfig>('dmarket', () => {
  const publicKey = readSecret('DMARKET_PUBLIC_KEY').toLowerCase();
  const secretKey = readSecret('DMARKET_SECRET_KEY').toLowerCase();

  return {
    publicKey,
    secretKey,
    isTradingEnabled: publicKey.length > 0 && secretKey.length > 0,
  };
});

export const csfloatConfig = registerAs<CsfloatConfig>('csfloat', () => {
  const apiKey = readSecret('CSFLOAT_API_KEY');

  return { apiKey, isEnabled: apiKey.length > 0 };
});

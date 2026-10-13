import { AsyncLocalStorage } from 'node:async_hooks';

import type { NextFunction, Request, Response } from 'express';

export const LOCALES = ['ru', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

const LANGUAGE_NAMES: Record<Locale, string> = { ru: 'Russian', en: 'English' };

const storage = new AsyncLocalStorage<Locale>();

const isLocale = (value: string): value is Locale => (LOCALES as readonly string[]).includes(value);

export const pickLocale = (header: string | undefined): Locale =>
  (header ?? '')
    .split(',')
    .map((part) => part.split(';')[0].trim().slice(0, 2).toLowerCase())
    .find(isLocale) ?? DEFAULT_LOCALE;

export const requestLocale = (): Locale => storage.getStore() ?? DEFAULT_LOCALE;

export const languageName = (): string => LANGUAGE_NAMES[requestLocale()];

export const withLocale = <T>(locale: Locale, run: () => T): T => storage.run(locale, run);

export const localeMiddleware = (request: Request, _response: Response, next: NextFunction) =>
  storage.run(pickLocale(request.headers['accept-language']), next);

'use client';

import {
  type AppLocale,
  LOCALE_COOKIE_NAME,
} from '@/i18n/routing';

const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function persistLocale(locale: AppLocale) {
  document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
}

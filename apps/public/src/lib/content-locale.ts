import { headers } from 'next/headers';
import type { Locale } from 'next-intl';
import {
  CONTENT_LOCALE_HEADER,
  getLocalizedPath,
  isLocale,
  defaultLocale,
  locales,
} from '@/i18n/routing';

export function getContentLocaleFromPath(path: string[] = []): Locale {
  const [first] = path;
  return isLocale(first) ? first : defaultLocale;
}

export function stripContentLocale(path: string[] = []) {
  return isLocale(path[0]) ? path.slice(1) : path;
}

export async function getRequestContentLocale(): Promise<Locale> {
  const locale = (await headers()).get(CONTENT_LOCALE_HEADER);
  if (locale && isLocale(locale)) {
    return locale;
  }

  return defaultLocale;
}

export function getLocalizedContentUrl(pathname: string, locale: Locale) {
  return getLocalizedPath(pathname, locale);
}

export function getAllLocalizedParams<T extends Record<string, unknown>>(
  createParams: (locale: Locale) => T[],
) {
  return locales.flatMap((locale) =>
    createParams(locale).map((params) => ({
      ...params,
      locale,
    })),
  );
}

export function getLocalizedSlugParam(slug: string, locale: Locale) {
  return locale === defaultLocale ? slug : `${locale}/${slug}`;
}

export function parseLocalizedSlugParam(slug: string): {
  locale: Locale;
  slug: string;
} {
  const parts = slug.split('/').filter(Boolean);
  const [first, section, value] = parts;

  if (isLocale(first) && value && section) {
    return {
      locale: first,
      slug: value,
    };
  }

  return {
    locale: defaultLocale,
    slug,
  };
}

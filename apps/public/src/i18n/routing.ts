import type { Locale } from 'next-intl';

export type AppLocale = Locale;

export const defaultLocale = 'en';
export const locales = ['en'] as const;
export const localizedLocales = locales.filter(
  (locale) => locale !== defaultLocale,
);
export const CONTENT_LOCALE_HEADER = 'x-openpanel-content-locale';
export const LOCALE_COOKIE_NAME = 'openpanel_locale';
export const OPENPANEL_ORIGIN = 'https://openpanel.dev';

export function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale);
}

export function toAppLocale(locale: string | undefined): AppLocale {
  return isLocale(locale) ? locale : defaultLocale;
}

export function getLocalePrefix(locale: AppLocale): string[] {
  return locale === defaultLocale ? [] : [locale];
}

export function getLocalizedPath(pathname: string, locale: AppLocale) {
  if (locale === defaultLocale) {
    return pathname;
  }

  return `/${[locale, pathname.replace(/^\/+/, '')].filter(Boolean).join('/')}`;
}

export function localizedHref(href: string, locale: AppLocale): string {
  if (href.startsWith('#') || href.startsWith('?')) {
    return href;
  }

  const pathname = getSameOriginPath(href);
  if (!pathname) {
    return href;
  }

  const [first] = pathname.split('/').filter(Boolean);
  if (isLocale(first)) {
    return pathname;
  }

  return getLocalizedPath(pathname, locale);
}

function getSameOriginPath(href: string): string | null {
  if (href.startsWith('/')) {
    return href;
  }

  try {
    const url = new URL(href);
    if (url.origin !== OPENPANEL_ORIGIN) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function getLocaleSwitchHref(
  pathname: string | null,
  locale: AppLocale,
) {
  if (!pathname) {
    return localizedHref('/', locale);
  }

  const parts = pathname.split('/').filter(Boolean);
  const pathWithoutLocale = isLocale(parts[0]) ? parts.slice(1) : parts;
  return localizedHref(`/${pathWithoutLocale.join('/')}`, locale);
}

export function getHtmlLang(locale: AppLocale) {
  return 'en';
}

export const languageItems = locales.map((locale) => ({
  locale,
  label: 'English',
  shortLabel: 'EN',
}));

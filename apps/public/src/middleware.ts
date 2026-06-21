import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  CONTENT_LOCALE_HEADER,
  type AppLocale,
  defaultLocale,
  isLocale,
  LOCALE_COOKIE_NAME,
  localizedHref,
  toAppLocale,
} from './i18n/routing';

const PUBLIC_FILE = /\.(.*)$/;
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const segments = pathname.split('/').filter(Boolean);
  const [maybeLocale] = segments;

  if (pathname.endsWith('.md')) {
    const url = request.nextUrl.clone();
    const locale = isLocale(maybeLocale)
      ? maybeLocale
      : getPreferredLocale(request);
    const requestHeaders = getLocaleRequestHeaders(request, locale);
    url.pathname = '/md';
    url.searchParams.set('path', pathname.slice(0, -3));
    return NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
  }

  if (maybeLocale === defaultLocale) {
    const url = request.nextUrl.clone();
    const pathnameWithoutLocale = `/${segments.slice(1).join('/')}`;
    url.pathname = pathnameWithoutLocale === '/' ? '/' : pathnameWithoutLocale;

    return withLocaleCookie(NextResponse.redirect(url), defaultLocale);
  }

  if (isLocale(maybeLocale)) {
    const requestHeaders = getLocaleRequestHeaders(request, maybeLocale);
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    return withLocaleCookie(response, maybeLocale);
  }

  if (PUBLIC_FILE.test(pathname)) {
    return NextResponse.next();
  }

  if (pathname === '/dpa/download') {
    return NextResponse.next();
  }

  if (segments.length === 0 || isPublicPagePath(segments[0])) {
    const preferredLocale = getPreferredLocale(request);
    if (preferredLocale !== defaultLocale) {
      const url = request.nextUrl.clone();
      url.pathname = localizedHref(pathname, preferredLocale);
      return withLocaleCookie(NextResponse.redirect(url), preferredLocale);
    }

    const url = request.nextUrl.clone();
    url.pathname = `/en${pathname === '/' ? '' : pathname}`;
    const requestHeaders = getLocaleRequestHeaders(request, defaultLocale);
    return NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
  }

  return NextResponse.next();
}

function getPreferredLocale(request: NextRequest) {
  return toAppLocale(request.cookies.get(LOCALE_COOKIE_NAME)?.value);
}

function getLocaleRequestHeaders(request: NextRequest, locale: AppLocale) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CONTENT_LOCALE_HEADER, locale);
  return requestHeaders;
}

function withLocaleCookie(response: NextResponse, locale: AppLocale) {
  response.cookies.set(LOCALE_COOKIE_NAME, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
  });
  return response;
}

function isPublicPagePath(segment: string) {
  return [
    'articles',
    'compare',
    'docs',
    'features',
    'for',
    'guides',
    'open-source',
    'pricing',
    'supporter',
    'tools',
  ].includes(segment);
}

export const config = {
  matcher: ['/((?!_next|api|favicon|robots|sitemap|og|llms|md).*)'],
};

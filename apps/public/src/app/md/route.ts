import { OPENPANEL_BASE_URL } from '@/lib/openpanel-brand';
import type { Locale } from 'next-intl';
import {
  CONTENT_LOCALE_HEADER,
  defaultLocale,
  isLocale,
  toAppLocale,
} from '@/i18n/routing';
import {
  getArticlePage,
  getContentPage,
  getDocsPage,
  getGuidePage,
  parseDocsUrlSegments,
} from '@/lib/source';
import { NextResponse } from 'next/server';

const ALLOWED_PAGE_PATHS = new Set([
  'privacy',
  'terms',
  'about',
  'contact',
  'cookies',
]);

export const runtime = 'nodejs';

function stubMarkdown(canonicalUrl: string, path: string): string {
  return `# ${path}\n\nThis page is available at: [${canonicalUrl}](${canonicalUrl})\n`;
}

function parseContentPath(path: string, preferredLocale: Locale) {
  const segments = path.split('/').filter(Boolean);
  const hasLocalePrefix = isLocale(segments[0]);
  const locale = hasLocalePrefix ? segments[0] : preferredLocale;
  const rest = hasLocalePrefix ? segments.slice(1) : segments;

  return { locale, segments: rest };
}

async function getProcessedText(page: {
  data: { getText?: (type: 'processed' | 'raw') => Promise<string> };
}): Promise<string | null> {
  try {
    const getText = page.data.getText;
    if (typeof getText === 'function') {
      return await getText('processed');
    }
  } catch {
    // ignore
  }
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const requestLocale = toAppLocale(
    request.headers.get(CONTENT_LOCALE_HEADER) ?? undefined,
  );

  // Rewrites preserve the original request URL, so pathname is e.g. /docs/foo.md
  // Derive path from pathname when present; otherwise use query (e.g. /md?path=...)
  const pathParam = pathname.endsWith('.md')
    ? pathname.slice(0, -3)
    : url.searchParams.get('path');

  if (!pathParam || pathParam.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const path = pathParam.startsWith('/') ? pathParam : `/${pathParam}`;

  const pathSegments = path.split('/').filter(Boolean);
  const docsPath = parseDocsUrlSegments(pathSegments);

  if (docsPath) {
    const hasLocalePrefix = isLocale(pathSegments[0]);
    const locale = hasLocalePrefix ? docsPath.locale : requestLocale;
    const { slugs } = docsPath;
    const page = getDocsPage(slugs, locale);
    if (!page) {
      return new NextResponse('Not found', { status: 404 });
    }
    const processed = await page.data.getText('processed');
    const canonical = `${OPENPANEL_BASE_URL}${page.url}`;
    const body = `# ${page.data.title}\n\nURL: ${canonical}\n\n${processed}`;
    return new Response(body, {
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  const contentPath = parseContentPath(path, requestLocale);

  if (contentPath.segments[0] === 'articles') {
    const slug = contentPath.segments.slice(1);
    if (slug.length === 0)
      return new NextResponse('Not found', { status: 404 });
    const page = getArticlePage(slug, contentPath.locale as Locale);
    if (!page) {
      return new NextResponse('Not found', { status: 404 });
    }
    const text = await getProcessedText(page);
    const canonical = `${OPENPANEL_BASE_URL}${page.url}`;
    const body = text
      ? `# ${page.data.title}\n\nURL: ${canonical}\n\n${text}`
      : stubMarkdown(canonical, path);
    return new Response(body, {
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  if (contentPath.segments[0] === 'guides') {
    const slug = contentPath.segments.slice(1);
    if (slug.length === 0)
      return new NextResponse('Not found', { status: 404 });
    const page = getGuidePage(slug, contentPath.locale as Locale);
    if (!page) {
      return new NextResponse('Not found', { status: 404 });
    }
    const text = await getProcessedText(page);
    const canonical = `${OPENPANEL_BASE_URL}${page.url}`;
    const body = text
      ? `# ${page.data.title}\n\nURL: ${canonical}\n\n${text}`
      : stubMarkdown(canonical, path);
    return new Response(body, {
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  if (
    contentPath.segments.length === 0 ||
    contentPath.segments.length === 1
  ) {
    const segment = contentPath.segments[0] ?? '';
    const slug = segment ? [segment] : [];
    const page = slug.length
      ? getContentPage(slug, contentPath.locale as Locale)
      : null;
    if (page) {
      try {
        const getText = (
          page.data as { getText?: (mode: string) => Promise<string> }
        ).getText;
        if (typeof getText === 'function') {
          const processed = await getText('processed');
          const canonical = `${OPENPANEL_BASE_URL}${page.url}`;
          const body = `# ${page.data.title}\n\nURL: ${canonical}\n\n${processed}`;
          return new Response(body, {
            headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          });
        }
      } catch {
        // fall through to stub if getText not available
      }
      if (ALLOWED_PAGE_PATHS.has(segment)) {
        return new Response(
          stubMarkdown(`${OPENPANEL_BASE_URL}/${segment}`, path),
          {
            headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          },
        );
      }
    }
    if (ALLOWED_PAGE_PATHS.has(segment)) {
      return new Response(
        stubMarkdown(`${OPENPANEL_BASE_URL}/${segment}`, path),
        {
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
        },
      );
    }
  }

  return new NextResponse('Not found', { status: 404 });
}

import { OPENPANEL_BASE_URL } from '@/lib/openpanel-brand';
import { articleSource, guideSource, pageSource, source } from '@/lib/source';
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

  // Rewrites preserve the original request URL, so pathname is e.g. /docs/foo.md
  // Derive path from pathname when present; otherwise use query (e.g. /md?path=...)
  const pathParam = pathname.endsWith('.md')
    ? pathname.slice(0, -3)
    : url.searchParams.get('path');

  if (!pathParam || pathParam.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  const path = pathParam.startsWith('/') ? pathParam : `/${pathParam}`;

  if (path.startsWith('/docs')) {
    const slug = path
      .replace(/^\/docs\/?/, '')
      .split('/')
      .filter(Boolean);
    const page = source.getPage(slug);
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

  if (path.startsWith('/articles')) {
    const slug = path
      .replace(/^\/articles\/?/, '')
      .split('/')
      .filter(Boolean);
    if (slug.length === 0)
      return new NextResponse('Not found', { status: 404 });
    const page = articleSource.getPage(slug);
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

  if (path.startsWith('/guides')) {
    const slug = path
      .replace(/^\/guides\/?/, '')
      .split('/')
      .filter(Boolean);
    if (slug.length === 0)
      return new NextResponse('Not found', { status: 404 });
    const page = guideSource.getPage(slug);
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
    path === '/' ||
    (path.startsWith('/') && path.split('/').filter(Boolean).length === 1)
  ) {
    const segment = path.replace(/^\//, '');
    const slug = segment ? [segment] : [];
    const page = slug.length ? pageSource.getPage(slug) : null;
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

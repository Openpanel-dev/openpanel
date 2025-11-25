import { createHash } from 'node:crypto';
// adding .js next/script import fixes an issues
// with esm and nextjs (when using pages dir)
import { NextResponse } from 'next/server.js';

type CreateNextRouteHandlerOptions = {
  apiUrl?: string;
};

export function createNextRouteHandler(
  options?: CreateNextRouteHandlerOptions,
) {
  return async function POST(req: Request) {
    const apiUrl = options?.apiUrl ?? 'https://api.openpanel.dev';
    const headers = new Headers();

    const ip =
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-forwarded-for')?.split(',')[0] ??
      req.headers.get('x-vercel-forwarded-for');
    headers.set('Content-Type', 'application/json');
    headers.set(
      'openpanel-client-id',
      req.headers.get('openpanel-client-id') ?? '',
    );
    headers.set('origin', req.headers.get('origin') ?? '');
    headers.set('User-Agent', req.headers.get('user-agent') ?? '');
    if (ip) {
      headers.set('openpanel-client-ip', ip);
    }

    try {
      const res = await fetch(`${apiUrl}/track`, {
        method: 'POST',
        headers,
        body: JSON.stringify(await req.json()),
      });
      return NextResponse.json(await res.text(), { status: res.status });
    } catch (e) {
      return NextResponse.json(e);
    }
  };
}

export function createScriptHandler() {
  return async function GET(req: Request) {
    const url = new URL(req.url);
    const query = url.searchParams.toString();

    if (!url.pathname.endsWith('op1.js')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const scriptUrl = 'https://openpanel.dev/op1.js';
    try {
      const res = await fetch(scriptUrl, {
        // @ts-ignore
        next: { revalidate: 86400 },
      });
      const text = await res.text();
      const etag = `"${createHash('md5')
        .update(text + query)
        .digest('hex')}"`;
      return new NextResponse(text, {
        headers: {
          'Content-Type': 'text/javascript',
          'Cache-Control':
            'public, max-age=86400, stale-while-revalidate=86400',
          ETag: etag,
        },
      });
    } catch (e) {
      return NextResponse.json(
        {
          error: 'Failed to fetch script',
          message: e instanceof Error ? e.message : String(e),
        },
        { status: 500 },
      );
    }
  };
}

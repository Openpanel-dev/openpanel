import { createHash } from 'node:crypto';
import { getClientIpFromHeaders } from '@openpanel/common/server/get-client-ip';
// adding .js next/script import fixes an issues
// with esm and nextjs (when using pages dir)
import { NextResponse } from 'next/server.js';

type CreateNextRouteHandlerOptions = {
  apiUrl?: string;
};

function createNextRouteHandler(options: CreateNextRouteHandlerOptions) {
  return async function POST(req: Request) {
    const apiUrl = options.apiUrl ?? 'https://api.openpanel.dev';
    const headers = new Headers(req.headers);
    const clientIp = getClientIpFromHeaders(headers);
    console.log('debug', {
      clientIp,
      userAgent: req.headers.get('user-agent'),
    });
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

function createScriptHandler() {
  return async function GET(req: Request) {
    if (!req.url.endsWith('op1.js')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const scriptUrl = 'https://openpanel.dev/op1.js';
    try {
      const res = await fetch(scriptUrl, {
        next: { revalidate: 86400 },
      });
      const text = await res.text();
      const etag = `"${createHash('md5').update(text).digest('hex')}"`;
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

export const POST = createNextRouteHandler({});
export const GET = createScriptHandler();

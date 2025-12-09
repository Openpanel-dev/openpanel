import { createHash } from 'node:crypto';
// adding .js next/script import fixes an issues
// with esm and nextjs (when using pages dir)
import { NextResponse } from 'next/server.js';

type RouteHandlerOptions = {
  apiUrl?: string;
};

const DEFAULT_API_URL = 'https://api.openpanel.dev';
const SCRIPT_URL = 'https://openpanel.dev';
const SCRIPT_PATH = '/op1.js';

function getClientHeaders(req: Request): Headers {
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

  // Construct origin: browsers send Origin header for POST requests and cross-origin requests,
  // but not for same-origin GET requests. Fallback to constructing from request URL.
  const origin =
    req.headers.get('origin') ??
    (() => {
      const url = new URL(req.url);
      return `${url.protocol}//${url.host}`;
    })();
  headers.set('origin', origin);

  headers.set('User-Agent', req.headers.get('user-agent') ?? '');
  if (ip) {
    headers.set('openpanel-client-ip', ip);
  }

  return headers;
}

async function handleApiRoute(
  req: Request,
  apiUrl: string,
  apiPath: string,
): Promise<NextResponse> {
  const headers = getClientHeaders(req);

  try {
    const res = await fetch(`${apiUrl}${apiPath}`, {
      method: req.method,
      headers,
      body:
        req.method === 'POST' ? JSON.stringify(await req.json()) : undefined,
    });

    if (res.headers.get('content-type')?.includes('application/json')) {
      return NextResponse.json(await res.json(), { status: res.status });
    }
    return NextResponse.json(await res.text(), { status: res.status });
  } catch (e) {
    return NextResponse.json(
      {
        error: 'Failed to proxy request',
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}

async function handleScriptProxyRoute(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (!pathname.endsWith(SCRIPT_PATH)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let scriptUrl = `${SCRIPT_URL}${SCRIPT_PATH}`;
  if (url.searchParams.size > 0) {
    scriptUrl += `?${url.searchParams.toString()}`;
  }

  try {
    const res = await fetch(scriptUrl, {
      // @ts-ignore
      next: { revalidate: 86400 },
    });
    const text = await res.text();
    const etag = `"${createHash('md5')
      .update(scriptUrl + text)
      .digest('hex')}"`;

    return new NextResponse(text, {
      headers: {
        'Content-Type': 'text/javascript',
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400',
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
}

function createRouteHandler(options?: RouteHandlerOptions) {
  const apiUrl = options?.apiUrl ?? DEFAULT_API_URL;

  const handler = async function handler(req: Request): Promise<NextResponse> {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method;

    // Handle script proxy: GET /op1.js
    if (method === 'GET' && pathname.endsWith(SCRIPT_PATH)) {
      return handleScriptProxyRoute(req);
    }

    const apiPathMatch = pathname.indexOf('/track');
    if (apiPathMatch === -1) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const apiPath = pathname.substring(apiPathMatch);
    return handleApiRoute(req, apiUrl, apiPath);
  };

  handler.GET = handler;
  handler.POST = handler;

  return handler;
}

export { createRouteHandler };

// const routeHandler = createRouteHandler();
// export const GET = routeHandler;
// export const POST = routeHandler;
// Or
// export const { GET, POST } = createRouteHandler();

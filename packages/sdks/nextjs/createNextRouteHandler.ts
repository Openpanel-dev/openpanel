import { NextResponse } from 'next/server';

const VALID_PATHS = [
  '/profile',
  '/profile/increment',
  '/profile/decrement',
  '/event',
];

function getIp(req: Request) {
  if (req.headers.get('X-Forwarded-For')) {
    return req.headers.get('X-Forwarded-For')?.split(',')[0];
  }
  return req.headers.get('x-real-ip') ?? '0.0.0.0';
}

function getPath(params?: Record<string, unknown>) {
  const segments = params?.op;
  if (segments && Array.isArray(segments)) {
    const path = `/${segments.join('/')}`;
    if (VALID_PATHS.includes(path)) {
      return path;
    }
  }

  return null;
}

export function createNextRouteHandler({
  clientId,
  clientSecret,
  url = 'https://api.openpanel.dev',
}: {
  clientId: string;
  clientSecret: string;
  url?: string;
}) {
  return {
    POST: async function POST(
      req: Request,
      { params }: { params: Record<string, unknown> }
    ) {
      const path = getPath(params);
      if (!path) {
        return NextResponse.json('Invalid path');
      }

      const headers = {
        'user-agent': req.headers.get('user-agent')!,
        'Content-Type': req.headers.get('Content-Type')!,
        'openpanel-client-id': clientId,
        'openpanel-client-secret': clientSecret,
        'x-client-ip': getIp(req)!,
      };

      try {
        const res = await fetch(`${url}${path}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(await req.json()),
        });
        return NextResponse.json(await res.text());
      } catch (e) {
        return NextResponse.json(e);
      }
    },
  };
}

// adding .js next/script import fixes an issues
// with esm and nextjs (when using pages dir)
import { NextResponse } from 'next/server.js';

type CreateNextRouteHandlerOptions = {
  apiUrl?: string;
};

export function createNextRouteHandler(options: CreateNextRouteHandlerOptions) {
  return async function POST(req: Request) {
    const apiUrl = options.apiUrl ?? 'https://api.openpanel.dev';
    const headers = new Headers(req.headers);
    try {
      const res = await fetch(`${apiUrl}/track`, {
        method: 'POST',
        headers,
        body: JSON.stringify(await req.json()),
      });
      return NextResponse.json(await res.text());
    } catch (e) {
      return NextResponse.json(e);
    }
  };
}

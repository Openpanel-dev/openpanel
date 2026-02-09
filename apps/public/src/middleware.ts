import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.endsWith('.md')) {
    const url = request.nextUrl.clone();
    url.pathname = '/md';
    url.searchParams.set('path', pathname.slice(0, -3));
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|favicon|robots|sitemap|og).*\\.md)'],
};

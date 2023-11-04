import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export const config = { matcher: ['/api/sdk/:path*'] };

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, Mixan-Client-Id, Mixan-Client-Secret',
};

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (request.method === 'OPTIONS') {
    return NextResponse.json({}, { headers: cors });
  }

  Object.entries(cors).forEach(([key, value]) => {
    response.headers.append(key, value);
  });
  return response;
}

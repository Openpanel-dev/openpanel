import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // defaults to auto
export function GET(req: Request) {
  const qwe = new URL(req.url);
  const item = qwe.searchParams.entries();
  const {
    value: [key, value],
  } = item.next();

  if (key && value) {
    cookies().set(`@mixan-${key}`, JSON.stringify(value), {
      httpOnly: true,
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
    });
  }

  return NextResponse.json({ key, value });
}

import * as EmailValidator from 'email-validator';
import { NextResponse } from 'next/server';

import { db } from '@openpanel/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json();

  if (!body.email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  if (!EmailValidator.validate(body.email)) {
    return NextResponse.json({ error: 'Email is not valid' }, { status: 400 });
  }

  await db.waitlist.create({
    data: {
      email: String(body.email).toLowerCase(),
    },
  });

  return NextResponse.json(body);
}

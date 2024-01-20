import { createRecentDashboard } from '@/server/services/dashboard.service';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // defaults to auto
export async function POST(req: Request) {
  await createRecentDashboard(await req.json());
  revalidatePath('/', 'layout');
  return NextResponse.json({ ok: 'qe' });
}

import * as cache from '@/server/cache';
import { db } from '@/server/db';
import { getUniqueEvents } from '@/server/services/event.service';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const projects = await db.project.findMany();

  for (const project of projects) {
    const events = await getUniqueEvents({ projectId: project.id });
    cache.set(`events_${project.id}`, 1000 * 60 * 60 * 24, events);
  }

  res.status(200).json({ ok: true });
}

import type { Queue } from 'bullmq';

import { redis } from '../../redis';

export async function findJobByPrefix<T>(
  queue: Queue<T, any, string>,
  matcher: string
) {
  const prefix = `bull:${queue.name}:`;
  const keys = await redis.keys(`${prefix}${matcher}*`);
  const key = keys.findLast((key) => !key.endsWith(':logs'));
  return key ? await queue.getJob(key.replace(prefix, '')) : undefined;
}

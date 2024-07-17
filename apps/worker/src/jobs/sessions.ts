import type { Job } from 'bullmq';

import type { SessionsQueuePayload } from '@openpanel/queue';

import { createSessionEnd } from './events.create-session-end';

export async function sessionsJob(job: Job<SessionsQueuePayload>) {
  return await createSessionEnd(job);
}

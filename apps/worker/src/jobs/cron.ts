import type { Job } from 'bullmq';

import type { CronQueuePayload } from '@openpanel/queue/src/queues';

import { salt } from './cron.salt';

export async function cronJob(job: Job<CronQueuePayload>) {
  switch (job.data.type) {
    case 'salt': {
      return await salt();
    }
  }
}

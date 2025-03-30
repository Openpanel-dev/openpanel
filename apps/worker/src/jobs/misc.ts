import type { Job } from 'bullmq';

import type { MiscQueuePayloadTrialEndingSoon } from '@openpanel/queue';

import { trialEndingSoonJob } from './misc.trail-ending-soon';

export async function miscJob(job: Job<MiscQueuePayloadTrialEndingSoon>) {
  switch (job.data.type) {
    case 'trialEndingSoon': {
      return await trialEndingSoonJob(job);
    }
  }
}

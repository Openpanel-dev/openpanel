import type { Job } from 'bullmq';

import { updateCohortMembership } from '@openpanel/db';
import type { CohortComputePayload } from '@openpanel/queue';

export async function cohortComputeJob(job: Job<CohortComputePayload>) {
  await updateCohortMembership(job.data.cohortId);
}

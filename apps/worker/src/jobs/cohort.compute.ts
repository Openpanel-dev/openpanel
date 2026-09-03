// Dissolved into @openpanel/core's cohort module (M5-003): the compute body
// moved to packages/core/src/modules/cohort/cohort.service.ts#updateCohortMembership.
// This file stays (DELEGATE PATTERN) — it is the BullMQ job body V1's worker
// registers (boot-workers.ts), a thin wrapper around the core function.
import { updateCohortMembership } from '@openpanel/core';
import type { CohortComputePayload } from '@openpanel/queue';
import type { Job } from 'bullmq';

export async function cohortComputeJob(job: Job<CohortComputePayload>) {
  await updateCohortMembership(job.data.cohortId);
}

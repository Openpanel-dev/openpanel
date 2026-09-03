// Dissolved into @openpanel/core's cohort module (M5-003): the non-static
// cohort lookup moved to
// packages/core/src/modules/cohort/cohort.service.ts#listRefreshableCohortIds.
// This file stays (DELEGATE PATTERN) — it is the `cron.ts` dispatcher's
// `cohortRefresh` case, a thin wrapper around the core function. The enqueue
// itself stays inline against @openpanel/queue's cohortComputeQueue directly
// — same as gsc's worker file does for `gscProjectSync` (M5-002); see
// packages/core/src/modules/cohort/cohort.service.ts's header for why core
// cannot import @openpanel/queue back.
import { listRefreshableCohortIds } from '@openpanel/core';
import { cohortComputeQueue } from '@openpanel/queue';

export async function cohortRefreshCronJob() {
  const cohortIds = await listRefreshableCohortIds();

  await Promise.all(
    cohortIds.map((cohortId) =>
      cohortComputeQueue.add(
        'cohortCompute',
        { cohortId },
        { deduplication: { id: `cohort-${cohortId}` } }
      )
    )
  );
}

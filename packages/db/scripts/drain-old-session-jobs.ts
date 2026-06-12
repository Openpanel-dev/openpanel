// One-off cleanup: drain legacy `sessionEnd:{projectId}:{deviceId}` delayed
// jobs from the `sessions` queue. Run AFTER:
//
//   1. The new code is deployed (worker emits reaper-enqueued jobs with the
//      `sessionEnd:v2:*` jobId prefix).
//   2. The `events.incoming-event` queue has been resumed and you've verified
//      session metrics look healthy under the new flow.
//
// This removes only jobs whose jobId is `sessionEnd:*` and NOT `sessionEnd:v2:*`,
// leaving any reaper-enqueued v2 jobs intact. After this script runs you can
// safely resume the `sessions` queue.
//
// Idempotent: re-running on an already-drained queue is a no-op.
//
// Usage (from packages/db):
//   pnpm with-env tsx scripts/drain-old-session-jobs.ts
//   pnpm with-env tsx scripts/drain-old-session-jobs.ts --dry-run

import { sessionsQueue } from '@openpanel/queue';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log(
    `[drain-old-session-jobs] starting${dryRun ? ' (DRY RUN — no removes)' : ''}`
  );

  const jobs = await sessionsQueue.getJobs(['delayed', 'waiting']);

  const legacy: typeof jobs = [];
  const v2: typeof jobs = [];

  for (const job of jobs) {
    if (!job.id) continue;
    if (job.id.startsWith('sessionEnd:v2:')) {
      v2.push(job);
    } else if (job.id.startsWith('sessionEnd:')) {
      legacy.push(job);
    }
  }

  console.log(
    `[drain-old-session-jobs] found ${jobs.length} jobs total ` +
      `(${legacy.length} legacy, ${v2.length} v2, will keep v2)`
  );

  if (dryRun) {
    console.log('[drain-old-session-jobs] dry run — exiting');
    process.exit(0);
  }

  let removed = 0;
  let failed = 0;

  for (const job of legacy) {
    try {
      await job.remove();
      removed++;
      if (removed % 1000 === 0) {
        console.log(`[drain-old-session-jobs] removed ${removed}/${legacy.length}`);
      }
    } catch (error) {
      failed++;
      console.error('[drain-old-session-jobs] failed to remove job', job.id, error);
    }
  }

  console.log('[drain-old-session-jobs] done', {
    removed,
    failed,
    kept_v2: v2.length,
  });
  process.exit(0);
}

main().catch((error) => {
  console.error('[drain-old-session-jobs] fatal error:', error);
  process.exit(1);
});

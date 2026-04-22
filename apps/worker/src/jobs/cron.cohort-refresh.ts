import { db } from '@openpanel/db';
import { cohortComputeQueue } from '@openpanel/queue';

export async function cohortRefreshCronJob() {
  const cohorts = await db.cohort.findMany({
    where: { isStatic: false },
    select: { id: true },
  });

  await Promise.all(
    cohorts.map((cohort) =>
      cohortComputeQueue.add(
        'cohortCompute',
        { cohortId: cohort.id },
        {
          jobId: `cohort-${cohort.id}`,
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        },
      ),
    ),
  );
}

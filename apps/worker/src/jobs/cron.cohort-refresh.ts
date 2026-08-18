import { db, enqueueCohortCompute } from '@openpanel/db';

export async function cohortRefreshCronJob() {
  const cohorts = await db.cohort.findMany({
    where: { isStatic: false },
    select: { id: true },
  });

  await Promise.all(cohorts.map((cohort) => enqueueCohortCompute(cohort.id)));
}

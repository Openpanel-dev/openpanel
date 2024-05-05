import type { Queue } from 'bullmq';

export async function findJobByPrefix<T>(
  queue: Queue<T, any, string>,
  matcher: string
) {
  const delayed = await queue.getJobs('delayed');
  const filtered = delayed.filter((job) =>
    job?.opts?.jobId?.startsWith(matcher)
  );
  const getTime = (val?: string) => {
    if (!val) return null;
    const match = val.match(/:(\d+)$/);
    return match?.[1] ? parseInt(match[1], 10) : null;
  };
  filtered.sort((a, b) => {
    const aTime = getTime(a?.opts?.jobId);
    const bTime = getTime(b?.opts?.jobId);
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    return aTime - bTime;
  });
  return filtered[0];
}

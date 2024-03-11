import type { Queue } from 'bullmq';

export async function findJobByPrefix<T>(
  queue: Queue<T, any, string>,
  matcher: string
) {
  const delayed = await queue.getJobs('delayed');
  return delayed.find((job) => job.opts.jobId?.startsWith(matcher));
}

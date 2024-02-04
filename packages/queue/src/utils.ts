import type { Job } from 'bullmq';

export function findJobByPrefix<T>(
  jobs: Job<T, any, string>[],
  prefix: string
) {
  return jobs.find((job) => job.opts.jobId?.startsWith(prefix));
}

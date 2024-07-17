import type { Queue } from 'bullmq';

export async function findJobByPrefix<T>(
  queue: Queue<T, any, string>,
  keys: string[],
  matcher: string
) {
  const getTime = (val?: string) => {
    if (!val) return null;
    const match = val.match(/:(\d+)$/);
    return match?.[1] ? parseInt(match[1], 10) : null;
  };
  const filtered = keys
    .filter((key) => key.includes(matcher))
    .filter((key) => getTime(key));
  filtered.sort((a, b) => {
    const aTime = getTime(a);
    const bTime = getTime(b);
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    return aTime - bTime;
  });

  async function getJob(index: number) {
    if (index >= filtered.length) return null;

    const key = filtered[index]?.replace(/^bull:(\w+):/, '');
    // return new Promise((resolve) => )
    if (key) {
      const job = await queue.getJob(key);
      if ((await job?.getState()) === 'delayed') {
        return job;
      }
    }

    return getJob(index + 1);
  }

  return getJob(0);
}

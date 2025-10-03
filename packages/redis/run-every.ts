import { getRedisCache } from './redis';

export async function runEvery({
  interval,
  fn,
  key,
}: {
  interval: number;
  fn: () => Promise<void> | void;
  key: string;
}) {
  const cacheKey = `run-every:${key}`;
  const cacheExists = await getRedisCache().get(cacheKey);
  if (cacheExists) {
    return;
  }

  await getRedisCache().set(cacheKey, '1', 'EX', interval);
  return fn();
}

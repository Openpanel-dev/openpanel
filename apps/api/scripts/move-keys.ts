import { _getRedisQueue, getRedisCache, getRedisQueue } from '@openpanel/redis';

async function main() {
  const events = await _getRedisQueue().lrange('op:buffer:events_v2', 0, -1);
  await getRedisQueue().lpush('op:buffer:events_v2', ...events);

  const profiles = await _getRedisQueue().lrange('op:buffer:profiles', 0, -1);
  await getRedisQueue().lpush('op:buffer:profiles', ...profiles);

  process.exit(0);
}

main();

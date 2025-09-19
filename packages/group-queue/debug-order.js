const Redis = require('ioredis');
const { Queue } = require('./dist/index.js');

async function testOrdering() {
  const redis = new Redis('redis://127.0.0.1:6379');
  const namespace = 'debug-order-' + Date.now();
  const q = new Queue({ redis, namespace });

  console.log('=== Enqueuing jobs ===');

  // Enqueue in the exact same order as the test
  const jobs = [
    {
      groupId: 'g1',
      payload: { n: 2 },
      orderMs: new Date('2025-01-01 00:00:00.500').getTime(),
    },
    {
      groupId: 'g1',
      payload: { n: 4 },
      orderMs: new Date('2025-01-01 00:01:01.000').getTime(),
    },
    {
      groupId: 'g1',
      payload: { n: 3 },
      orderMs: new Date('2025-01-01 00:00:00.800').getTime(),
    },
    {
      groupId: 'g1',
      payload: { n: 1 },
      orderMs: new Date('2025-01-01 00:00:00.000').getTime(),
    },
  ];

  for (const job of jobs) {
    const jobId = await q.add(job);
    console.log(
      `Enqueued job n:${job.payload.n}, orderMs:${job.orderMs}, jobId:${jobId}`,
    );

    // Check group state after each add
    const groupKey = `${namespace}:g:g1`;
    const readyKey = `${namespace}:ready`;
    const groupJobs = await redis.zrange(groupKey, 0, -1, 'WITHSCORES');
    const readyGroups = await redis.zrange(readyKey, 0, -1, 'WITHSCORES');

    console.log(`  Group jobs: ${JSON.stringify(groupJobs)}`);
    console.log(`  Ready groups: ${JSON.stringify(readyGroups)}`);
    console.log('');
  }

  console.log('=== Reserving jobs ===');
  for (let i = 0; i < 4; i++) {
    const job = await q.reserve();
    if (job) {
      console.log(
        `Reserved job n:${job.payload.n}, orderMs:${job.orderMs}, score:${job.score}`,
      );
      await q.complete(job);
    }
  }

  await redis.quit();
}

testOrdering().catch(console.error);

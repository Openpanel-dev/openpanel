const Redis = require('ioredis');

async function testSimpleOrdering() {
  const redis = new Redis('redis://127.0.0.1:6379');
  const ns = 'simple-test';

  // Clear any existing data
  const keys = await redis.keys(`${ns}*`);
  if (keys.length) await redis.del(keys);

  console.log('=== Testing Job Ordering ===');

  // Manually trace what happens step by step
  console.log('\n1. Enqueue job n:2, orderMs:500');
  // Job n:2, orderMs:500, seq will be 1
  // score = 500 * 1000000 + 1 = 500000001
  await redis.hmset(`${ns}:job:1`, {
    id: '1',
    groupId: 'g1',
    payload: '{"n":2}',
    attempts: '0',
    maxAttempts: '3',
    seq: '1',
    enqueuedAt: '1000',
    orderMs: '500',
    score: '500000001',
  });
  await redis.zadd(`${ns}:g:g1`, 500000001, '1');

  // Check head and add to ready
  let head = await redis.zrange(`${ns}:g:g1`, 0, 0, 'WITHSCORES');
  console.log('  Group head after job 2:', head);
  await redis.zadd(`${ns}:ready`, head[1], 'g1');

  let ready = await redis.zrange(`${ns}:ready`, 0, -1, 'WITHSCORES');
  console.log('  Ready queue after job 2:', ready);

  console.log('\n2. Enqueue job n:4, orderMs:61000');
  // Job n:4, orderMs:61000, seq will be 2
  // score = 61000 * 1000000 + 2 = 61000000002
  await redis.hmset(`${ns}:job:2`, {
    id: '2',
    groupId: 'g1',
    payload: '{"n":4}',
    attempts: '0',
    maxAttempts: '3',
    seq: '2',
    enqueuedAt: '1000',
    orderMs: '61000',
    score: '61000000002',
  });
  await redis.zadd(`${ns}:g:g1`, 61000000002, '2');

  // Check head (should still be job 1) and update ready
  head = await redis.zrange(`${ns}:g:g1`, 0, 0, 'WITHSCORES');
  console.log('  Group head after job 4:', head);
  await redis.zadd(`${ns}:ready`, head[1], 'g1');

  ready = await redis.zrange(`${ns}:ready`, 0, -1, 'WITHSCORES');
  console.log('  Ready queue after job 4:', ready);

  console.log('\n3. Enqueue job n:1, orderMs:0');
  // Job n:1, orderMs:0, seq will be 4
  // score = 0 * 1000000 + 4 = 4
  await redis.hmset(`${ns}:job:4`, {
    id: '4',
    groupId: 'g1',
    payload: '{"n":1}',
    attempts: '0',
    maxAttempts: '3',
    seq: '4',
    enqueuedAt: '1000',
    orderMs: '0',
    score: '4',
  });
  await redis.zadd(`${ns}:g:g1`, 4, '4');

  // Check head (should now be job 4 with score 4) and update ready
  head = await redis.zrange(`${ns}:g:g1`, 0, 0, 'WITHSCORES');
  console.log('  Group head after job 1:', head);
  await redis.zadd(`${ns}:ready`, head[1], 'g1');

  ready = await redis.zrange(`${ns}:ready`, 0, -1, 'WITHSCORES');
  console.log('  Ready queue after job 1:', ready);

  console.log('\n=== Final State ===');
  const groupJobs = await redis.zrange(`${ns}:g:g1`, 0, -1, 'WITHSCORES');
  console.log('Group jobs (should be in score order):', groupJobs);

  const readyFinal = await redis.zrange(`${ns}:ready`, 0, -1, 'WITHSCORES');
  console.log('Ready queue (group score):', readyFinal);

  await redis.quit();
}

testSimpleOrdering().catch(console.error);

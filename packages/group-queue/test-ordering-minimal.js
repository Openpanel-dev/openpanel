import Redis from 'ioredis';
import { Queue } from './dist/index.js';

const redis = new Redis('redis://127.0.0.1:6379');
const namespace = 'test-minimal-order';
const q = new Queue({ redis, namespace });

console.log('=== Testing Minimal Ordering ===');

// Clear previous data
const keys = await redis.keys(`${namespace}*`);
if (keys.length) await redis.del(keys);

// Enqueue in problematic order (n:2 first, then n:1 with earlier orderMs)
console.log('Enqueuing n:2 with orderMs:500...');
await q.add({ groupId: 'g1', payload: { n: 2 }, orderMs: 500 });

console.log('Enqueuing n:1 with orderMs:0...');
await q.add({ groupId: 'g1', payload: { n: 1 }, orderMs: 0 });

// Reserve jobs and see order
console.log('\nReserving jobs:');
const job1 = await q.reserve();
console.log(
  `First job: n:${job1.payload.n}, orderMs:${job1.orderMs}, score:${job1.score}`,
);

await q.complete(job1);

const job2 = await q.reserve();
console.log(
  `Second job: n:${job2.payload.n}, orderMs:${job2.orderMs}, score:${job2.score}`,
);

await redis.quit();

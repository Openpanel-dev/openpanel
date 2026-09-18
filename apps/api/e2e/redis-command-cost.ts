/**
 * M18-003 — what does a LEGITIMATE Redis command on the cache client cost?
 *
 * `commandTimeout` on the cache client is a deadline every command on the
 * ingest path now runs under, including the event buffer's writes and reads.
 * Picking it needs the cost of the heaviest honest command, not a guess: if
 * the deadline is anywhere near a busy flush, a healthy server starts looking
 * like a down one and M18-001's shutdown path starts refusing to commit
 * offsets it should have committed.
 *
 * Measures the four shapes the cache client actually issues, worst first:
 *   - `MULTI` of `EVENT_BUFFER_BATCH_SIZE` rpush — the shutdown flush of a
 *     full local buffer (`event-buffer.ts:writeToRedis`).
 *   - `MULTI` of the micro-batch size — the steady-state ingest write.
 *   - `LRANGE 0..batchSize-1` — the cron flush read (`processBuffer`).
 *   - `GET` — every cache/auth lookup.
 *
 * Runs against the local server in its own database with its own key prefix.
 *
 *   dotenv -e ../../.env -- bun e2e/redis-command-cost.ts
 */

import { Redis } from '@openpanel/redis';

/** Its own database: this must not touch anything the dev stack is using. */
const BENCH_REDIS_DB = 4;
const KEY = 'm18003:command-cost';

/** `event-buffer.ts` — DEFAULT_BATCH_SIZE / DEFAULT_MICRO_BATCH_SIZE. */
const EVENT_BUFFER_BATCH_SIZE = 4000;
const EVENT_BUFFER_MICRO_BATCH_SIZE = 100;

const GET_ITERATIONS = 2000;
const MICRO_BATCH_ITERATIONS = 200;
const FULL_BATCH_ITERATIONS = 20;
const LRANGE_ITERATIONS = 100;
const WARMUP_ITERATIONS = 5;

/** A row shaped like the JSONEachRow lines the buffer actually stores. */
function sampleEventRow(index: number): string {
  return JSON.stringify({
    id: crypto.randomUUID(),
    name: 'screen_view',
    device_id: crypto.randomUUID(),
    profile_id: '',
    project_id: 'e2e1e2e1-0000-4000-8000-000000000001',
    session_id: crypto.randomUUID(),
    path: `/pricing/plan/${index}`,
    origin: 'https://openpanel.dev',
    referrer: 'https://www.google.com/',
    referrer_name: 'Google',
    referrer_type: 'search',
    duration: 0,
    created_at: new Date().toISOString(),
    country: 'SE',
    city: 'Stockholm',
    region: 'Stockholm County',
    longitude: 18.0686,
    latitude: 59.3293,
    os: 'Mac OS',
    os_version: '10.15.7',
    browser: 'Chrome',
    browser_version: '148.0.0.0',
    device: 'desktop',
    brand: 'Apple',
    model: '',
    imported_at: null,
    sdk_name: '@openpanel/web',
    sdk_version: '1.0.9',
    properties: {
      __hash: '',
      __query:
        'utm_source=newsletter&utm_medium=email&utm_campaign=launch-week',
      __title: 'Pricing — OpenPanel, the open source analytics platform',
      __reason: 'navigation',
      plan: 'business',
      seats: 12,
      experiment_bucket: 'variant-b',
    },
  });
}

interface Timing {
  label: string;
  samples: number[];
  bytes?: number;
}

function report({ label, samples, bytes }: Timing): string {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (quantile: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(quantile * sorted.length))] ??
    0;
  const size = bytes === undefined ? '' : ` payload=${bytes}B`;
  return `${label.padEnd(38)} n=${samples.length}${size} p50=${at(0.5).toFixed(2)}ms p95=${at(0.95).toFixed(2)}ms p99=${at(0.99).toFixed(2)}ms max=${(sorted.at(-1) ?? 0).toFixed(2)}ms`;
}

async function time(iterations: number, run: () => Promise<unknown>) {
  for (let index = 0; index < WARMUP_ITERATIONS; index++) {
    await run();
  }
  const samples: number[] = [];
  for (let index = 0; index < iterations; index++) {
    const startedAt = performance.now();
    await run();
    samples.push(performance.now() - startedAt);
  }
  return samples;
}

async function main() {
  const url = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:23379');
  url.pathname = `/${BENCH_REDIS_DB}`;
  const redis = new Redis(url.toString());
  const rows = Array.from({ length: EVENT_BUFFER_BATCH_SIZE }, (_, index) =>
    sampleEventRow(index)
  );
  const rowBytes = Math.round(
    rows.reduce((total, row) => total + Buffer.byteLength(row), 0) / rows.length
  );

  console.log(
    `redis ${url.host} db ${BENCH_REDIS_DB}, mean row ${rowBytes}B, batch ${EVENT_BUFFER_BATCH_SIZE}`
  );

  await redis.del(KEY);

  const pushMulti = async (count: number) => {
    const multi = redis.multi();
    for (let index = 0; index < count; index++) {
      multi.rpush(KEY, rows[index] as string);
    }
    await multi.exec();
    await redis.del(KEY);
  };

  const fullBatch = await time(FULL_BATCH_ITERATIONS, () =>
    pushMulti(EVENT_BUFFER_BATCH_SIZE)
  );
  const microBatch = await time(MICRO_BATCH_ITERATIONS, () =>
    pushMulti(EVENT_BUFFER_MICRO_BATCH_SIZE)
  );

  await redis.del(KEY);
  await redis.rpush(KEY, ...rows);
  const lrange = await time(LRANGE_ITERATIONS, () =>
    redis.lrange(KEY, 0, EVENT_BUFFER_BATCH_SIZE - 1)
  );
  await redis.del(KEY);

  await redis.set(`${KEY}:get`, rows[0] as string);
  const get = await time(GET_ITERATIONS, () => redis.get(`${KEY}:get`));
  await redis.del(`${KEY}:get`);

  console.log(
    report({
      label: `MULTI ${EVENT_BUFFER_BATCH_SIZE}x rpush (shutdown flush)`,
      samples: fullBatch,
      bytes: rowBytes * EVENT_BUFFER_BATCH_SIZE,
    })
  );
  console.log(
    report({
      label: `MULTI ${EVENT_BUFFER_MICRO_BATCH_SIZE}x rpush (steady state)`,
      samples: microBatch,
      bytes: rowBytes * EVENT_BUFFER_MICRO_BATCH_SIZE,
    })
  );
  console.log(
    report({
      label: `LRANGE 0..${EVENT_BUFFER_BATCH_SIZE - 1} (cron flush)`,
      samples: lrange,
      bytes: rowBytes * EVENT_BUFFER_BATCH_SIZE,
    })
  );
  console.log(report({ label: 'GET (auth / cache lookup)', samples: get }));

  redis.disconnect();
}

await main();

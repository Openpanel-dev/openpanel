import { beforeEach, describe, expect, test } from 'bun:test';
import { getRedisCache } from '@openpanel/redis';
import { stubBufferDeps } from '../../test/buffer-fixtures';
import type { IClickhouseEvent } from '../modules/event/event.service';
import { EventBuffer } from './event-buffer';

const redis = getRedisCache();
/** Minimal row whose project and id exercise the Redis deduplication scope. */
const event = (
  id: string,
  projectId = 'redelivery-project'
): IClickhouseEvent =>
  ({ id, project_id: projectId, name: 'rebalance_probe' }) as IClickhouseEvent;

beforeEach(async () => {
  const keys = await redis.keys('event_buffer:*');
  if (keys.length) {
    await redis.del(...keys);
  }
});

describe('durable event redelivery', () => {
  test('two workers enqueue the same event once, even in different micro-batches', async () => {
    const workers = [
      new EventBuffer(stubBufferDeps),
      new EventBuffer(stubBufferDeps),
    ];
    for (const worker of workers) {
      worker.addRedeliverable(event('shared'));
      worker.addRedeliverable(event('shared'));
    }
    await Promise.all(workers.map((worker) => worker.flushPendingOrThrow()));
    expect(await redis.llen('event_buffer:queue')).toBe(1);
    workers[0]!.addRedeliverable(event('shared'));
    await workers[0]!.flushPendingOrThrow();
    expect(await redis.llen('event_buffer:queue')).toBe(1);
  });

  test('remembers an event after its queue row was drained', async () => {
    const first = new EventBuffer(stubBufferDeps);
    first.addRedeliverable(event('drained'));
    await first.flushPendingOrThrow();
    await redis.del('event_buffer:queue');
    const second = new EventBuffer(stubBufferDeps);
    second.addRedeliverable(event('drained'));
    await second.flushPendingOrThrow();
    expect(await redis.llen('event_buffer:queue')).toBe(0);
  });

  test('a refused queue write leaves no claim and redelivery can succeed', async () => {
    await redis.set('event_buffer:queue', 'wrong-type');
    const first = new EventBuffer(stubBufferDeps);
    first.addRedeliverable(event('retry'));
    await expect(first.flushPendingOrThrow()).rejects.toThrow('WRONGTYPE');
    expect(await redis.keys('event_buffer:dedup:*')).toEqual([]);
    await redis.del('event_buffer:queue');
    const second = new EventBuffer(stubBufferDeps);
    second.addRedeliverable(event('retry'));
    await second.flushPendingOrThrow();
    expect(await redis.llen('event_buffer:queue')).toBe(1);
  });

  test('expires dedup state so an intentional later replay is accepted', async () => {
    const buffer = new EventBuffer(stubBufferDeps);
    buffer.addRedeliverable(event('expires'));
    await buffer.flushPendingOrThrow();
    const key = 'event_buffer:dedup:redelivery-project:expires';
    expect(await redis.ttl(key)).toBeGreaterThan(0);
    expect(await redis.ttl(key)).toBeLessThanOrEqual(3600);
    await redis.pexpire(key, 1);
    await Bun.sleep(10);
    buffer.addRedeliverable(event('expires'));
    await buffer.flushPendingOrThrow();
    expect(await redis.llen('event_buffer:queue')).toBe(2);
  });

  test('validates every marker before writing any event in a micro-batch', async () => {
    await redis.lpush(
      'event_buffer:dedup:redelivery-project:corrupt',
      'not a string'
    );
    const buffer = new EventBuffer(stubBufferDeps);
    buffer.addRedeliverable(event('first'));
    buffer.addRedeliverable(event('corrupt'));
    await expect(buffer.flushPendingOrThrow()).rejects.toThrow('WRONGTYPE');
    expect(await redis.llen('event_buffer:queue')).toBe(0);
    expect(
      await redis.exists('event_buffer:dedup:redelivery-project:first')
    ).toBe(0);
    await redis.del('event_buffer:dedup:redelivery-project:corrupt');
    const retry = new EventBuffer(stubBufferDeps);
    retry.addRedeliverable(event('first'));
    retry.addRedeliverable(event('corrupt'));
    await retry.flushPendingOrThrow();
    expect(await redis.llen('event_buffer:queue')).toBe(2);
  });

  test('scopes ids to projects and leaves non-Kafka producers unchanged', async () => {
    const buffer = new EventBuffer(stubBufferDeps);
    buffer.addRedeliverable(event('same', 'project-a'));
    buffer.addRedeliverable(event('same', 'project-b'));
    buffer.add(event('same', 'project-a'));
    buffer.add(event('same', 'project-a'));
    await buffer.flushPendingOrThrow();
    expect(await redis.llen('event_buffer:queue')).toBe(4);
  });
});

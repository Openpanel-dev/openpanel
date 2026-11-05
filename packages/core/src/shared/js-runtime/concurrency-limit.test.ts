import { describe, expect, it } from 'bun:test';
import { createConcurrencyLimit } from './concurrency-limit';

const MAX_CONCURRENT = 2;
const TASK_COUNT = 7;

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('createConcurrencyLimit', () => {
  it('runs at most the limit at once and queues the rest in order', async () => {
    const limit = createConcurrencyLimit(MAX_CONCURRENT);
    const gates = Array.from({ length: TASK_COUNT }, deferred);
    const started: number[] = [];
    let running = 0;
    let peak = 0;

    const runs = gates.map((gate, index) =>
      limit(async () => {
        started.push(index);
        running++;
        peak = Math.max(peak, running);
        await gate.promise;
        running--;
        return index;
      })
    );

    await Bun.sleep(0);
    expect(started).toEqual([0, 1]);

    for (const gate of gates) {
      gate.resolve();
      await Bun.sleep(0);
    }

    expect(await Promise.all(runs)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(started).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(peak).toBe(MAX_CONCURRENT);
  });

  it('frees the slot when a task throws', async () => {
    const limit = createConcurrencyLimit(1);
    const failing = limit(() => Promise.reject(new Error('boom')));
    const next = limit(async () => 'ran');

    await expect(failing).rejects.toThrow('boom');
    expect(await next).toBe('ran');
  });
});

import { describe, expect, it } from 'bun:test';
import { mapWithConcurrency } from './concurrency';

const settle = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe('mapWithConcurrency', () => {
  it('returns results in input order, not completion order', async () => {
    const items = [40, 30, 20, 10, 0];
    const results = await mapWithConcurrency(items, 5, async (delay) => {
      await settle(delay);
      return delay;
    });

    expect(results).toEqual(items);
  });

  it('never exceeds the limit and still visits every item once', async () => {
    const items = Array.from({ length: 20 }, (_, index) => index);
    let inFlight = 0;
    let peak = 0;

    const results = await mapWithConcurrency(items, 4, async (index) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await settle(1);
      inFlight -= 1;
      return index * 2;
    });

    expect(peak).toBe(4);
    expect(results).toEqual(items.map((index) => index * 2));
  });

  it('passes the input index alongside the item', async () => {
    const results = await mapWithConcurrency(
      ['a', 'b', 'c'],
      2,
      async (item, index) => `${index}:${item}`
    );

    expect(results).toEqual(['0:a', '1:b', '2:c']);
  });

  it('handles an empty input without spawning a worker', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });

  it('rejects when one item rejects', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (item) => {
        if (item === 2) {
          throw new Error('boom');
        }
        return item;
      })
    ).rejects.toThrow('boom');
  });
});

/**
 * Fan `items` out over at most `limit` in-flight promises.
 *
 * Results come back in **input order**, never completion order — every caller
 * here assembles an ordered array whose order is part of the response bytes.
 */
export async function mapWithConcurrency<Item, Result>(
  items: Item[],
  limit: number,
  run: (item: Item, index: number) => Promise<Result>
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await run(items[index] as Item, index);
      }
    })
  );
  return results;
}

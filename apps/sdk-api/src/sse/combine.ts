// @ts-nocheck

export async function* combine<T>(iterable: AsyncGenerator<T>[]): T[] {
  const asyncIterators = Array.from(iterable, (o) => o[Symbol.asyncIterator]());
  const results = [];
  let count = asyncIterators.length;
  const never = new Promise(() => {});
  function getNext(asyncIterator: AsyncGenerator, index: number) {
    return asyncIterator.next().then((result) => ({
      index,
      result,
    }));
  }
  const nextPromises = asyncIterators.map(getNext);
  try {
    while (count) {
      const { index, result } = await Promise.race(nextPromises);
      if (result.done) {
        nextPromises[index] = never;
        results[index] = result.value;
        count--;
      } else {
        nextPromises[index] = getNext(asyncIterators[index], index);
        yield result.value;
      }
    }
  } finally {
    for (const [index, iterator] of asyncIterators.entries())
      if (nextPromises[index] != never && iterator.return != null)
        iterator.return();
  }
  return results;
}

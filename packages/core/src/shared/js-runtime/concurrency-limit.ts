/** Runs at most `maxConcurrent` tasks at once; the rest wait in FIFO order. */
export function createConcurrencyLimit(maxConcurrent: number) {
  let running = 0;
  const waiting: Array<() => void> = [];

  const acquire = async (): Promise<void> => {
    if (running < maxConcurrent) {
      running++;
      return;
    }
    // The releasing task hands its slot over, so `running` stays unchanged.
    await new Promise<void>((resolve) => waiting.push(resolve));
  };

  const release = (): void => {
    const next = waiting.shift();
    if (next) {
      next();
      return;
    }
    running--;
  };

  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
}

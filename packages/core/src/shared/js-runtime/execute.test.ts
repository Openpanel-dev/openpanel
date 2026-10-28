import { describe, expect, it } from 'bun:test';
import { execute, runInSandbox } from './execute';

const IS_LINUX = process.platform === 'linux';

describe('template sandbox', () => {
  it('fails a template that allocates past the memory limit', async () => {
    const run = execute("(payload) => 'x'.repeat(2 ** 30)", {});
    await expect(run).rejects.toThrow('Error executing JavaScript template');
    // The OS cap is Linux-only; elsewhere the output cap rejects it after the
    // child allocates.
    if (IS_LINUX) {
      await expect(run).rejects.toThrow(/memory/i);
    }
  });

  it.if(IS_LINUX)(
    'fails a template that doubles a string until it runs out of memory',
    async () => {
      const doubling = `(payload) => [${Array.from({ length: 32 }, () => 0).join(',')}].reduce((a) => a + a, 'x'.repeat(1024))`;
      await expect(execute(doubling, {})).rejects.toThrow(/memory/i);
    }
  );

  it('kills a child that outlives its deadline', async () => {
    const started = performance.now();
    await expect(
      runInSandbox(
        // Exponential backtracking on a short string: slow, but no memory.
        "(payload) => 'a'.repeat(40).replace(/(a+)+b/, '')",
        {},
        { timeoutMs: 10_000, deadlineMs: 100, maxOutputBytes: 1000 }
      )
    ).rejects.toThrow('timed out');
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('runs an honest template under the limits', async () => {
    expect(
      await execute('(payload) => ({ n: payload.n + 1 })', { n: 1 })
    ).toEqual({
      n: 2,
    });
  });
});

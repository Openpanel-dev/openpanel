// Stubs shared by the buffer tests. Not a test file (no `*.test.ts` suffix),
// so the runner does not pick it up.

import type { BufferDeps } from '../src/buffers/base-buffer';
import type { Logger } from '../src/logger';

const silentLogger: Logger = {
  fatal: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  child: () => silentLogger,
};

/**
 * A buffer's boot scope, silent and never paused. Silent matters: the real
 * `createLogger` spawns a pino transport worker thread per buffer, and these
 * suites build one buffer per test.
 *
 * M10-009: `BufferDeps.ch` is the boot scope's ClickHouse client, so a suite
 * that exercises a flush hands in its own fake here rather than mocking
 * `@openpanel/db`'s module. `stubBufferDeps` leaves it unset — a buffer that
 * reaches ClickHouse without one is a bug this stub should surface, not hide.
 */
export const stubBufferDeps: BufferDeps = {
  createLogger: () => silentLogger,
  isCronPaused: () => Promise.resolve(false),
};

/** `stubBufferDeps` plus a fake ClickHouse client for the flush path. */
export function bufferDepsWithCh(ch: unknown): BufferDeps {
  return { ...stubBufferDeps, ch: ch as BufferDeps['ch'] };
}

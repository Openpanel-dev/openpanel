// Stubs shared by the buffer tests.

import type { BufferDeps } from '../src/buffers/base-buffer';
import type { Logger } from '../src/logger';
import { testCoreConfig } from './config-fixture';

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
 * `createLogger` spawns a pino transport worker thread per buffer.
 *
 * `stubBufferDeps` hands in a ClickHouse client that throws on first touch, so
 * a buffer reaching ClickHouse without a suite's own fake is surfaced.
 */
const throwingClickHouse = new Proxy({} as BufferDeps['ch'], {
  get() {
    throw new Error(
      'stubBufferDeps has no ClickHouse client — use bufferDepsWithCh(fake)'
    );
  },
});

export const stubBufferDeps: BufferDeps = {
  createLogger: () => silentLogger,
  config: testCoreConfig(),
  isCronPaused: () => Promise.resolve(false),
  ch: throwingClickHouse,
};

/** `stubBufferDeps` plus a fake ClickHouse client for the flush path, and an
 *  optional sizing override for the suites that exercise chunking. */
export function bufferDepsWithCh(
  ch: unknown,
  config: BufferDeps['config'] = stubBufferDeps.config
): BufferDeps {
  return { ...stubBufferDeps, ch: ch as BufferDeps['ch'], config };
}

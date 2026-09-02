/**
 * ENABLED_QUEUES validation only (ADR-004 rec 5/6 + docs/ANSWERS.md §1.3
 * ruling). `bootWorkers()` itself isn't exercised here — it starts real
 * BullMQ workers and the Kafka consumer, which is integration territory.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./utils/logger', () => {
  const makeLogger = (): Record<string, ReturnType<typeof vi.fn>> => {
    const log: Record<string, ReturnType<typeof vi.fn>> = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    };
    log.child = vi.fn(() => makeLogger());
    return log;
  };
  return { logger: makeLogger() };
});

import { assertKnownQueue, getEnabledQueues } from './boot-workers';
import { logger } from './utils/logger';

const fatal = vi.mocked(logger.fatal);

// `process.exit`'s two overloads (string | number | null | undefined) don't
// unify with vi.spyOn's generic inference — pin the mock to one signature.
function mockProcessExit() {
  return vi
    .spyOn(process, 'exit')
    .mockImplementation((_code?: string | number | null): never => {
      return undefined as never;
    });
}

describe('getEnabledQueues', () => {
  const originalEnabledQueues = process.env.ENABLED_QUEUES;
  let exitSpy: ReturnType<typeof mockProcessExit>;

  beforeEach(() => {
    vi.clearAllMocks();
    if (originalEnabledQueues === undefined) {
      delete process.env.ENABLED_QUEUES;
    } else {
      process.env.ENABLED_QUEUES = originalEnabledQueues;
    }
    exitSpy = mockProcessExit();
  });

  it('defaults to events plus the seven registry queues when unset', () => {
    delete process.env.ENABLED_QUEUES;
    expect(getEnabledQueues()).toEqual([
      'events',
      'sessions',
      'cron',
      'notification',
      'import',
      'insights',
      'gsc',
      'cohortCompute',
    ]);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('accepts a comma-separated subset of known queues', () => {
    process.env.ENABLED_QUEUES = 'events, sessions ,cron';
    expect(getEnabledQueues()).toEqual(['events', 'sessions', 'cron']);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('rejects the events_kafka fixture with a message naming the rename', () => {
    process.env.ENABLED_QUEUES = 'events_kafka';
    getEnabledQueues();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fatal).toHaveBeenCalledTimes(1);
    const [meta, message] = fatal.mock.calls[0] ?? [];
    expect(message).toContain('events_kafka');
    expect(message).toContain('renamed');
    expect(message).toContain('events');
    expect(meta).toMatchObject({ value: 'events_kafka', renamedTo: 'events' });
  });

  it('rejects an unknown token, non-zero exit naming value and accepted set', () => {
    process.env.ENABLED_QUEUES = 'not_a_real_queue';
    getEnabledQueues();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fatal).toHaveBeenCalledTimes(1);
    const [meta, message] = fatal.mock.calls[0] ?? [];
    expect(message).toContain('not_a_real_queue');
    expect(meta).toMatchObject({
      value: 'not_a_real_queue',
      accepted: [
        'events',
        'sessions',
        'cron',
        'notification',
        'import',
        'insights',
        'gsc',
        'cohortCompute',
      ],
    });
  });
});

describe('assertKnownQueue', () => {
  let exitSpy: ReturnType<typeof mockProcessExit>;

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = mockProcessExit();
  });

  it('accepts every registry queue and events', () => {
    for (const name of [
      'events',
      'sessions',
      'cron',
      'notification',
      'import',
      'insights',
      'gsc',
      'cohortCompute',
    ]) {
      assertKnownQueue(name);
    }
    expect(fatal).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

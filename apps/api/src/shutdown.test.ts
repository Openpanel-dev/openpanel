/**
 * The regression test for drill 03's loss (M18-001).
 *
 * Both halves matter and the happy path alone would not have caught the bug:
 * (a) the event buffer is flushed to Redis BEFORE the Kafka consumer is
 * stopped, and (b) a FAILED flush stops the sequence there — the consumer is
 * never stopped and the process exits non-zero, so Kafka redelivers instead of
 * dropping the events for good.
 */

import { describe, expect, it, mock } from 'bun:test';
import {
  runShutdownSequence,
  SHUTDOWN_EXIT_FAILED,
  SHUTDOWN_EXIT_OK,
  type ShutdownSteps,
} from './shutdown';

const silentLogger = () => ({
  info: mock(() => undefined),
  error: mock(() => undefined),
  fatal: mock(() => undefined),
});

/**
 * Every step appends its own name, so the assertions are about ORDER rather
 * than about how many times something was called.
 */
function recordingSteps(overrides: Partial<ShutdownSteps> = {}): {
  steps: ShutdownSteps;
  calls: string[];
} {
  const calls: string[] = [];
  const step = (name: string) => async () => {
    // A tick, so a step that was started concurrently with a later one would
    // interleave and be visible in `calls`.
    await Promise.resolve();
    calls.push(name);
  };

  return {
    calls,
    steps: {
      stopHttpServer: step('stopHttpServer'),
      drainCron: step('drainCron'),
      closeWorkers: step('closeWorkers'),
      stopConsuming: step('stopConsuming'),
      flushEventBuffer: step('flushEventBuffer'),
      stopConsumer: step('stopConsumer'),
      closeProducers: step('closeProducers'),
      disconnectKafka: step('disconnectKafka'),
      ...overrides,
    },
  };
}

describe('runShutdownSequence', () => {
  it('flushes the event buffer before the consumer is stopped', async () => {
    const { steps, calls } = recordingSteps();

    const exitCode = await runShutdownSequence(steps, silentLogger());

    expect(exitCode).toBe(SHUTDOWN_EXIT_OK);
    expect(calls).toEqual([
      'stopHttpServer',
      'drainCron',
      'closeWorkers',
      'stopConsuming',
      'flushEventBuffer',
      'stopConsumer',
      'closeProducers',
      'disconnectKafka',
    ]);
    expect(calls.indexOf('flushEventBuffer')).toBeLessThan(
      calls.indexOf('stopConsumer')
    );
  });

  it('lets in-flight handlers finish before it flushes', async () => {
    // The shape drill 03 measured: a message is still being handled when the
    // signal arrives. `stopConsuming` must not resolve until that handler has,
    // and the flush must not start until `stopConsuming` has resolved.
    const calls: string[] = [];
    let handlerFinished = false;

    const { steps } = recordingSteps({
      stopConsuming: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        handlerFinished = true;
        calls.push('stopConsuming');
      },
      flushEventBuffer: async () => {
        expect(handlerFinished).toBe(true);
        calls.push('flushEventBuffer');
      },
      stopConsumer: async () => {
        calls.push('stopConsumer');
      },
    });

    const exitCode = await runShutdownSequence(steps, silentLogger());

    expect(exitCode).toBe(SHUTDOWN_EXIT_OK);
    expect(calls).toEqual([
      'stopConsuming',
      'flushEventBuffer',
      'stopConsumer',
    ]);
  });

  it('does not stop the consumer when the flush fails, and exits non-zero', async () => {
    const { steps, calls } = recordingSteps({
      flushEventBuffer: () => Promise.reject(new Error('redis is unreachable')),
    });
    const logger = silentLogger();

    const exitCode = await runShutdownSequence(steps, logger);

    expect(exitCode).toBe(SHUTDOWN_EXIT_FAILED);
    expect(calls).toEqual([
      'stopHttpServer',
      'drainCron',
      'closeWorkers',
      'stopConsuming',
    ]);
    expect(calls).not.toContain('stopConsumer');
    expect(calls).not.toContain('disconnectKafka');
    expect(logger.fatal).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('does not flush after a teardown step failed before it', async () => {
    const { steps, calls } = recordingSteps({
      stopConsuming: () => Promise.reject(new Error('kafka is gone')),
    });

    const exitCode = await runShutdownSequence(steps, silentLogger());

    expect(exitCode).toBe(SHUTDOWN_EXIT_FAILED);
    expect(calls).not.toContain('stopConsumer');
  });
});

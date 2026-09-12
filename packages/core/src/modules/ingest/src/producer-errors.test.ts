/**
 * The producer's fatal-error classification, split out of `kafka.ts` with
 * M16-002's batching. Only these failures invalidate the idempotent
 * producer's PID/sequence state; everything else must be retried against the
 * SAME producer rather than silently rebuilding it.
 */

import { describe, expect, mock, test } from 'bun:test';
import { isFatalProducerError, sendWithFatalRecovery } from './producer-errors';

const protocolError = (code: number) =>
  Object.assign(new Error(`protocol ${code}`), {
    name: 'KafkaJSProtocolError',
    code,
  });

describe('isFatalProducerError', () => {
  test.each([45, 46, 47, 65])('protocol error %i is fatal', (code) => {
    expect(isFatalProducerError(protocolError(code))).toBe(true);
  });

  test('retries-exceeded is fatal for this producer', () => {
    expect(
      isFatalProducerError(
        Object.assign(new Error('gave up'), {
          name: 'KafkaJSNumberOfRetriesExceeded',
        })
      )
    ).toBe(true);
  });

  test.each([1, 7, 44])('protocol error %i is not fatal', (code) => {
    expect(isFatalProducerError(protocolError(code))).toBe(false);
  });

  test.each([
    ['a plain error', new Error('connection reset')],
    ['a string', 'nope'],
    ['null', null],
  ])('%s is not fatal', (_label, err) => {
    expect(isFatalProducerError(err)).toBe(false);
  });
});

describe('sendWithFatalRecovery', () => {
  test('leaves a successful produce untouched', async () => {
    const onFatal = mock(() => undefined);
    await sendWithFatalRecovery(() => Promise.resolve(), onFatal);
    expect(onFatal).not.toHaveBeenCalled();
  });

  test('rethrows a non-fatal failure without recovering', async () => {
    const onFatal = mock(() => undefined);
    const err = new Error('transient');
    await expect(
      sendWithFatalRecovery(() => Promise.reject(err), onFatal)
    ).rejects.toBe(err);
    expect(onFatal).not.toHaveBeenCalled();
  });

  test('recovers and still rethrows a fatal failure', async () => {
    const onFatal = mock((_err: unknown) => undefined);
    const err = protocolError(65);
    await expect(
      sendWithFatalRecovery(() => Promise.reject(err), onFatal)
    ).rejects.toBe(err);
    expect(onFatal).toHaveBeenCalledTimes(1);
  });
});

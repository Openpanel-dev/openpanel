/**
 * The batching accumulator's correctness contract. Batching exists to
 * amortise the produce round-trip, and it is only adoptable
 * if it changes nothing a caller can observe:
 *
 * (i) per-key ordering survives — same-key messages leave in produce order,
 * inside one `send` and across consecutive sends; (ii) a caller's promise
 * settles on its OWN batch, so a failed send rejects exactly the callers whose
 * messages were in it; (iii) a partially filled batch still goes out inside the
 * linger window; (iv) a failed batch still runs the fatal-producer recovery
 * path.
 *
 * No broker: `send` is injected, which is the same seam `kafka.ts` fills with
 * the real producer call.
 */

import { describe, expect, mock, test } from 'bun:test';
import { createProducerBatcher } from './producer-batcher';
import { sendWithFatalRecovery } from './producer-errors';

const LINGER_MS = 5;
const LINGER_GRACE_MS = 40;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A `send` whose completion the test controls, recording what it was given. */
const controllableSend = () => {
  const batches: string[][] = [];
  const settlers: {
    resolve: () => void;
    reject: (err: unknown) => void;
  }[] = [];
  const send = (messages: string[]) => {
    batches.push([...messages]);
    return new Promise<void>((resolve, reject) => {
      settlers.push({ resolve, reject });
    });
  };
  return { batches, settlers, send };
};

/** Swallows a rejection so an unhandled rejection cannot fail the suite. */
const settled = (promise: Promise<void>) =>
  promise.then(
    () => 'resolved' as const,
    (err) => ({ rejected: err })
  );

describe('createProducerBatcher', () => {
  test('sends one batch of many messages once the batch size is reached', async () => {
    const { batches, settlers, send } = controllableSend();
    const batcher = createProducerBatcher<string>({
      batchSize: 3,
      lingerMs: LINGER_MS,
      send,
    });

    const first = settled(batcher.enqueue('a'));
    const second = settled(batcher.enqueue('b'));
    const third = settled(batcher.enqueue('c'));
    await sleep(0);

    expect(batches).toEqual([['a', 'b', 'c']]);
    settlers[0]?.resolve();
    expect(await Promise.all([first, second, third])).toEqual([
      'resolved',
      'resolved',
      'resolved',
    ]);
  });

  test('(i) keeps enqueue order inside a batch and across batches', async () => {
    const { batches, settlers, send } = controllableSend();
    const batcher = createProducerBatcher<string>({
      batchSize: 2,
      lingerMs: LINGER_MS,
      send,
    });

    const produced = ['k1', 'k2', 'k3', 'k4'];
    const promises = produced.map((message) =>
      settled(batcher.enqueue(message))
    );
    await sleep(0);

    // Exactly one send is outstanding: the second batch waits for the first,
    // which is what keeps same-key messages in order across sends regardless
    // of `maxInFlightRequests`.
    expect(batches).toEqual([['k1', 'k2']]);
    settlers[0]?.resolve();
    await sleep(0);
    expect(batches).toEqual([
      ['k1', 'k2'],
      ['k3', 'k4'],
    ]);
    settlers[1]?.resolve();
    await Promise.all(promises);
    expect(batches.flat()).toEqual(produced);
  });

  test('(ii) a failed batch rejects its own callers and nobody else', async () => {
    const { batches, settlers, send } = controllableSend();
    const batcher = createProducerBatcher<string>({
      batchSize: 2,
      lingerMs: LINGER_MS,
      send,
    });

    const failing = [
      settled(batcher.enqueue('a')),
      settled(batcher.enqueue('b')),
    ];
    await sleep(0);
    const surviving = [
      settled(batcher.enqueue('c')),
      settled(batcher.enqueue('d')),
    ];

    const boom = new Error('broker refused the batch');
    settlers[0]?.reject(boom);
    expect(await Promise.all(failing)).toEqual([
      { rejected: boom },
      { rejected: boom },
    ]);

    await sleep(0);
    expect(batches[1]).toEqual(['c', 'd']);
    settlers[1]?.resolve();
    expect(await Promise.all(surviving)).toEqual(['resolved', 'resolved']);
  });

  test('(iii) flushes a partial batch within the linger window', async () => {
    const send = mock((_messages: string[]) => Promise.resolve());
    const batcher = createProducerBatcher<string>({
      batchSize: 100,
      lingerMs: LINGER_MS,
      send,
    });

    const pending = batcher.enqueue('lonely');
    expect(batcher.pendingCount()).toBe(1);
    expect(send).not.toHaveBeenCalled();

    await Promise.race([pending, sleep(LINGER_GRACE_MS)]);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toEqual(['lonely']);
    await pending;
    expect(batcher.pendingCount()).toBe(0);
  });

  test('(iii) the linger timer of a size-closed batch cannot close its successor', async () => {
    const send = mock((_messages: string[]) => Promise.resolve());
    const batcher = createProducerBatcher<string>({
      batchSize: 2,
      lingerMs: LINGER_MS,
      send,
    });

    await Promise.all([batcher.enqueue('a'), batcher.enqueue('b')]);
    const late = batcher.enqueue('c');
    await sleep(LINGER_GRACE_MS);
    await late;

    expect(send.mock.calls.map((call) => call[0])).toEqual([['a', 'b'], ['c']]);
  });

  test('(iv) a failed batch still runs the fatal-producer recovery', async () => {
    const onFatal = mock((_err: unknown) => undefined);
    const fatal = Object.assign(new Error('out of order'), {
      name: 'KafkaJSProtocolError',
      code: 45,
    });
    const batcher = createProducerBatcher<string>({
      batchSize: 2,
      lingerMs: LINGER_MS,
      send: () => sendWithFatalRecovery(() => Promise.reject(fatal), onFatal),
    });

    const results = await Promise.all([
      settled(batcher.enqueue('a')),
      settled(batcher.enqueue('b')),
    ]);

    expect(results).toEqual([{ rejected: fatal }, { rejected: fatal }]);
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal.mock.calls[0]?.[0]).toBe(fatal);
  });

  test('flush sends what is still accumulating and waits for it', async () => {
    const { batches, settlers, send } = controllableSend();
    const batcher = createProducerBatcher<string>({
      batchSize: 100,
      lingerMs: 60_000,
      send,
    });

    const pending = settled(batcher.enqueue('a'));
    let flushed = false;
    const flushing = batcher.flush().then(() => {
      flushed = true;
    });

    await sleep(0);
    expect(batches).toEqual([['a']]);
    expect(flushed).toBe(false);

    settlers[0]?.resolve();
    await flushing;
    expect(flushed).toBe(true);
    expect(await pending).toBe('resolved');
  });
});

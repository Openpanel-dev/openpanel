import { expect, test } from 'bun:test';
import { TRPCError } from '@trpc/server';
import {
  cancelledCallError,
  RpcDeadlineExceededError,
  raceCancellation,
} from './deadline';

const DEADLINE_MS = 30_000;

test('a deadline reason becomes TIMEOUT with the explained message', () => {
  const error = cancelledCallError(new RpcDeadlineExceededError(DEADLINE_MS));

  expect(error).toBeInstanceOf(TRPCError);
  expect(error.code).toBe('TIMEOUT');
  expect(error.message).toBe(
    'This request took longer than 30 seconds and was stopped. Try a shorter date range or fewer filters.'
  );
});

test('any other reason is a closed request', () => {
  expect(cancelledCallError(new DOMException('x', 'AbortError')).code).toBe(
    'CLIENT_CLOSED_REQUEST'
  );
});

test('raceCancellation resolves with the work when nothing aborts', async () => {
  const controller = new AbortController();

  expect(await raceCancellation(Promise.resolve(7), controller.signal)).toBe(7);
});

test('raceCancellation rejects as soon as the signal aborts', async () => {
  const controller = new AbortController();
  const never = new Promise<never>(() => undefined);

  const raced = raceCancellation(never, controller.signal);
  controller.abort(new RpcDeadlineExceededError(DEADLINE_MS));

  await expect(raced).rejects.toMatchObject({ code: 'TIMEOUT' });
});

test('raceCancellation rejects immediately on an already-aborted signal', async () => {
  await expect(
    raceCancellation(Promise.resolve(), AbortSignal.abort())
  ).rejects.toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
});

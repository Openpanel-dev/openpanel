// 30 s is the ceiling the dashboard already lived under: Elysia's Bun adapter
// defaults `idleTimeout` to 30 s and a non-streamed tRPC response writes no byte
// before it completes. The deadline keeps the ceiling but turns the silent
// socket close into an error and stops the work behind it.

import { TRPCError } from '@trpc/server';

export const RPC_DEADLINE_MS = 30_000;

const MS_PER_SECOND = 1000;

export class RpcDeadlineExceededError extends Error {
  constructor(deadlineMs: number) {
    super(
      `This request took longer than ${deadlineMs / MS_PER_SECOND} seconds and was stopped. Try a shorter date range or fewer filters.`
    );
    this.name = 'RpcDeadlineExceededError';
  }
}

/** Arms the deadline on a request's cancellation; returns the disarm. */
export function armDeadline(
  cancellation: AbortController,
  deadlineMs: number
): () => void {
  const timer = setTimeout(
    () => cancellation.abort(new RpcDeadlineExceededError(deadlineMs)),
    deadlineMs
  );
  return () => clearTimeout(timer);
}

/** The error a procedure fails with once its request's work was cancelled. */
export function cancelledCallError(reason: unknown): TRPCError {
  if (reason instanceof RpcDeadlineExceededError) {
    return new TRPCError({
      code: 'TIMEOUT',
      message: reason.message,
      cause: reason,
    });
  }
  return new TRPCError({
    code: 'CLIENT_CLOSED_REQUEST',
    message: 'The client closed the request before it completed.',
    cause: reason,
  });
}

/**
 * Resolves with `work`, or rejects with `cancelledCallError` as soon as
 * `signal` aborts — the caller is answered even if the work ignores the signal.
 */
export function raceCancellation<Result>(
  work: Promise<Result>,
  signal: AbortSignal
): Promise<Result> {
  if (signal.aborted) {
    return Promise.reject(cancelledCallError(signal.reason));
  }
  return new Promise<Result>((resolve, reject) => {
    const onAbort = () => reject(cancelledCallError(signal.reason));
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

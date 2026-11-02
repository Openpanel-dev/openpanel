// Hooks a provider SDK's `create` method so every call is recorded, without
// changing what the caller gets back. The OpenAI and Anthropic SDKs share a
// generator (Stainless): `create` returns an `APIPromise` whose
// `_thenUnwrap` keeps `.withResponse()` and `.asResponse()` working, and a
// stream whose `iterator` field feeds iteration, `tee()` and
// `toReadableStream()`. Their own helpers (`parse`, `stream`, `runTools`)
// call `create` on the client's resource, so patching the resource instance
// covers them too.

import {
  type AiCall,
  type AiCallOutcome,
  type AiIntegrationOptions,
  recordCall,
  resolveContext,
} from './payload';

export type CallDescription = Omit<AiCall, 'context' | 'startedAt'> & {
  stream: boolean;
};

export type CallResult = Omit<AiCallOutcome, 'stream' | 'timeToFirstTokenMs'>;

export interface StreamAccumulator {
  /** Returns whether the chunk carried generated output, which marks the first token. */
  observe(chunk: unknown): boolean;
  result(): CallResult;
}

/** Converts one provider endpoint's request, response and stream chunks. */
export interface CreateAdapter {
  describe(params: unknown): CallDescription;
  result(response: unknown): CallResult;
  accumulator?(): StreamAccumulator;
}

type CreateMethod = ((this: unknown, ...args: unknown[]) => unknown) & {
  [INSTRUMENTED]?: true;
};

interface ApiPromiseLike extends PromiseLike<unknown> {
  _thenUnwrap?(transform: (data: unknown) => unknown): unknown;
  responsePromise?: Promise<unknown>;
}

type StreamCall = AiCall & { stream: boolean };

const INSTRUMENTED = Symbol.for('openpanel.ai.instrumented');

function attempt<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function isPromiseLike(value: unknown): value is ApiPromiseLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  );
}

function record(
  call: StreamCall,
  outcome: Omit<AiCallOutcome, 'stream'>,
  options: AiIntegrationOptions
): void {
  recordCall(call, { ...outcome, stream: call.stream }, options);
}

function observeStream(
  stream: unknown,
  call: StreamCall,
  adapter: CreateAdapter,
  options: AiIntegrationOptions
): unknown {
  const target = stream as { iterator?: unknown };
  const accumulator = adapter.accumulator?.();
  if (!accumulator || typeof target?.iterator !== 'function') {
    record(call, {}, options);
    return stream;
  }
  const source = (target.iterator as () => AsyncIterator<unknown>).bind(stream);
  target.iterator = async function* observedIterator() {
    const iterator = source();
    let firstTokenAt: number | undefined;
    let finished = false;
    let error: unknown;
    try {
      for (;;) {
        const next = await iterator.next();
        if (next.done) {
          finished = true;
          return;
        }
        const carriedOutput = attempt(() => accumulator.observe(next.value));
        if (carriedOutput && firstTokenAt === undefined) {
          firstTokenAt = Date.now();
        }
        yield next.value;
      }
    } catch (caught) {
      error = caught;
      throw caught;
    } finally {
      const cancelled = !(finished || error);
      if (cancelled) {
        await iterator.return?.();
      }
      const result = attempt(() => accumulator.result()) ?? {};
      record(
        call,
        {
          ...result,
          error:
            error ??
            (cancelled ? new Error('stream cancelled') : undefined) ??
            result.error,
          timeToFirstTokenMs:
            firstTokenAt === undefined
              ? undefined
              : firstTokenAt - call.startedAt,
        },
        options
      );
    }
  };
  return stream;
}

function observeResponse(
  response: unknown,
  call: StreamCall,
  adapter: CreateAdapter,
  options: AiIntegrationOptions
): unknown {
  if (!isPromiseLike(response)) {
    return response;
  }
  const onData = (data: unknown) => {
    if (call.stream) {
      return attempt(() => observeStream(data, call, adapter, options)) ?? data;
    }
    record(call, attempt(() => adapter.result(data)) ?? {}, options);
    return data;
  };
  const onError = (error: unknown) => record(call, { error }, options);

  // Parsing stays lazy: `.asResponse()` must still get an unread body.
  if (typeof response._thenUnwrap === 'function') {
    response.responsePromise?.catch(onError);
    return response._thenUnwrap(onData);
  }
  return response.then(onData, (error: unknown) => {
    onError(error);
    throw error;
  });
}

/** Drops unset entries; `undefined` when none are left. */
export function definedOnly<T extends object>(value: T): T | undefined {
  const entries = Object.entries(value).filter(
    ([, entry]) => entry !== undefined && entry !== null
  );
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
}

/**
 * Replaces `resource.create` with a recording version. Calling it twice on
 * the same resource is a no-op, so a client can be wrapped more than once.
 */
export function instrumentCreate(
  resource: unknown,
  adapter: CreateAdapter,
  options: AiIntegrationOptions
): void {
  const target = resource as { create?: CreateMethod } | undefined;
  const original = target?.create;
  if (!target || typeof original !== 'function' || original[INSTRUMENTED]) {
    return;
  }
  const instrumented: CreateMethod = function create(this: unknown, ...args) {
    // Read now: the ambient `withAiContext` may be gone once a stream is read.
    const call = attempt(
      (): StreamCall => ({
        ...adapter.describe(args[0]),
        context: resolveContext(undefined, options),
        startedAt: Date.now(),
      })
    );
    let response: unknown;
    try {
      response = original.apply(this, args);
    } catch (error) {
      // The SDKs validate some params before any request, e.g. a `max_tokens` too large for a non-streamed call.
      if (call) {
        record(call, { error }, options);
      }
      throw error;
    }
    if (!call) {
      return response;
    }
    return (
      attempt(() => observeResponse(response, call, adapter, options)) ??
      response
    );
  };
  instrumented[INSTRUMENTED] = true;
  target.create = instrumented;
}

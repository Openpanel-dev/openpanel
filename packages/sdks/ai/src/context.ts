import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Who and what an AI call belongs to. Set per call through
 * `providerOptions.openpanel`, or for every call inside `withAiContext`.
 */
export interface AiCallContext {
  profileId?: string | number;
  groups?: string[];
  /** Binds the call to a web session's device (the web SDK's `getDeviceId()`). */
  deviceId?: string;
  /** Shared by every event of one request. `withAiContext` mints one when absent. */
  traceId?: string;
  parentId?: string;
  /** Groups traces into a conversation or thread. */
  conversationId?: string;
  /** Display name of the step, e.g. `summarize`. */
  name?: string;
  properties?: Record<string, unknown>;
  privacyMode?: boolean;
}

const storage = new AsyncLocalStorage<AiCallContext>();

export function createAiTraceId(): string {
  return randomUUID();
}

/**
 * Runs `fn` with a context every wrapped model call inside it inherits, and
 * one trace id for all of them, so an agent loop is one trace with a
 * generation per step. Nested calls merge over the outer context.
 */
export function withAiContext<T>(context: AiCallContext, fn: () => T): T {
  const outer = storage.getStore();
  const merged: AiCallContext = {
    ...outer,
    ...context,
    traceId: context.traceId ?? outer?.traceId ?? createAiTraceId(),
    properties:
      outer?.properties || context.properties
        ? { ...outer?.properties, ...context.properties }
        : undefined,
  };
  return storage.run(merged, fn);
}

export function getAiContext(): AiCallContext | undefined {
  return storage.getStore();
}

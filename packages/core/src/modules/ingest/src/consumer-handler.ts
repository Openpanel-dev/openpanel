// One `Ctx` per Kafka message, so the consumer's `handleEvent` is the same
// kind of work scope an HTTP request or a job run is (ADR-007).
//
// The requestId comes out of the envelope's `headers` map — the copy `/track`
// puts there, which ADR-018 R3 keeps as the consumer's source — and is
// sanitised exactly as an inbound HTTP `request-id` is, because it lands in
// the same log storage. Before M10-006 the handler read it only to bind a
// `reqId` log field: the ClickHouse writes, the buffer writes and the
// session-end enqueue the message caused all ran on boot-scoped clients, so
// the chain ended at the log line (docs/TECH_DEBT.md §2).

import { type AppDeps, createCtx } from '../../../context';
import { REQUEST_ID_HEADER, REQUEST_ID_LOG_FIELD } from '../../../logger';
import { resolveRequestId } from '../../../shared/request-id';
import type { IncomingEventPayload } from './incoming-event';
import {
  createIncomingEventDeps,
  type IncomingEventBindings,
  type IncomingEventDelivery,
  incomingEvent,
} from './incoming-event-handler';

export function incomingEventRequestId(payload: IncomingEventPayload): string {
  return resolveRequestId(payload.headers?.[REQUEST_ID_HEADER]);
}

/** The consumer's `handleEvent` (`EventsBatchHandlerDeps.handleEvent`). */
export function createIncomingEventHandler(
  deps: AppDeps,
  bindings: IncomingEventBindings
) {
  // Every event this handler buffers is produced again by a redelivery when
  // the batch's durability gate fails, so the event buffer must not keep a
  // re-queued copy of it too — `EventBuffer.addRedeliverable`. `createEvent()`
  // reaches the buffer as `deps.buffers.event` and takes no ownership
  // argument, so the ownership rides in on the scope. Built once, here, not
  // per message: the hot path gets no work it did not already have.
  const consumerDeps: AppDeps = {
    ...deps,
    buffers: { ...deps.buffers, event: deps.buffers.event.asRedeliverable() },
  };

  return (payload: IncomingEventPayload, meta: IncomingEventDelivery) => {
    const requestId = incomingEventRequestId(payload);
    const ctx = createCtx(consumerDeps, {
      requestId,
      logger: deps.logger.child({ [REQUEST_ID_LOG_FIELD]: requestId }),
    });
    return incomingEvent(payload, createIncomingEventDeps(ctx, bindings), meta);
  };
}

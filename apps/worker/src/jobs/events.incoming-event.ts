// Dissolved into @openpanel/core's ingest module (M8-003): the whole handler
// — session lifecycle decisions, session_start emission, referrer inheritance
// and the producer-minted event id — moved to
// packages/core/src/modules/ingest/src/incoming-event-handler.ts. This file
// stays (DELEGATE PATTERN) because it is what binds core's injected
// dependencies to V1's world: this worker's registry counters, this worker's
// pino, and `enqueueSessionEndV2`, which speaks @openpanel/queue's BullMQ
// wire shape and therefore cannot live in core.
import {
  type IncomingEventDelivery,
  type IncomingEventDeps,
  type IncomingEventPayload,
  incomingEvent as incomingEventCore,
  loadIncomingEventDeps,
} from '@openpanel/core';
import { sessionEndsEnqueued, sessionsStarted } from '@/metrics';
import { logger as baseLogger } from '@/utils/logger';
import { enqueueSessionEndV2 } from '@/utils/session-handler';

let deps: Promise<IncomingEventDeps> | null = null;

// Resolved once per process: the loader dynamically imports @openpanel/db's
// buffers, prisma client and notification service, and this is the hot path.
function getDeps(): Promise<IncomingEventDeps> {
  deps ??= loadIncomingEventDeps(baseLogger, enqueueSessionEndV2, {
    // V1's own registry, so this worker's /metrics body is unchanged.
    metrics: {
      sessionStarted: (kind) => sessionsStarted.inc({ kind }),
      sessionEndEnqueued: (source) => sessionEndsEnqueued.inc({ source }),
    },
  });
  return deps;
}

export async function incomingEvent(
  jobPayload: IncomingEventPayload,
  meta?: IncomingEventDelivery
) {
  return incomingEventCore(jobPayload, await getDeps(), meta);
}

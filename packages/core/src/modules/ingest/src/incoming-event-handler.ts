// Ported from apps/worker/src/jobs/events.incoming-event.ts (M8-003): the
// Kafka consumer's per-message handler — the step that turns one topic
// payload into session lifecycle decisions and ClickHouse rows.
//
// Everything that touches Redis, Postgres, ClickHouse or a queue is INJECTED
// (`IncomingEventDeps`), the way session-end.ts does it, so the tests drive
// the real code with recording doubles instead of `mock.module`.
// `createIncomingEventDeps` binds it to ONE MESSAGE'S ctx (M10-006): the
// buffers, the Postgres client and the session-end enqueue all ride the scope
// carrying that envelope's requestId, so the id the producer stamped reaches
// the row the consumer writes (ADR-018 R1). The two lookups a work scope
// cannot supply arrive as `IncomingEventBindings` from the composition root.

import { getTime, isSameDomain, parsePath } from '@openpanel/shared';
import { anyPass, isEmpty, isNil, mergeDeepRight, omit, reject } from 'ramda';
import type { SessionIngestResult } from '../../../buffers/session-buffer';
import type { Ctx } from '../../../context';
import type { Logger } from '../../../logger';
import {
  getReferrerWithQuery,
  parseReferrer,
} from '../../../shared/parse-referrer';
import {
  createEvent,
  type IServiceCreateEventPayload,
  type IServiceCreateEventPayloadWithId,
  type IServiceEvent,
} from '../../event/event.service';
import { matchEvent } from '../../notification/notification.service';
import type { IProjectFilters } from '../../project/project.constants';
import { getProjectByIdCached } from '../../project/project.service';
import type { IClickhouseSession } from '../../session/session.service';
import { sessionEndsEnqueued } from '../../session/src/session.metrics';
import type { EnqueueSessionEndInput } from '../../session/src/session-end';
import type { IncomingEventPayload } from './incoming-event';
import { duplicateEventsMarkedTotal, sessionsStarted } from './ingest.metrics';

const GLOBAL_PROPERTIES = ['__path', '__referrer', '__timestamp', '__revenue'];

/** How far before the event `session_start` is stamped, so it sorts first. */
const SESSION_START_OFFSET_MS = 100;

// Strip empty/nullish from B, then deep-merge over A.
const merge = <A, B>(a: Partial<A>, b: Partial<B>): A & B =>
  mergeDeepRight(a, reject(anyPass([isEmpty, isNil]))(b)) as A & B;

/** Kafka delivery coordinates, when the event came through the consumer. */
export interface IncomingEventDelivery {
  partition: number;
  offset: string;
}

/** The project fields the filter and first-event checks read. */
export interface IncomingEventProject {
  firstEventAt?: Date | null;
  filters?: IProjectFilters[] | null;
}

/** The session-buffer subset this handler drives. */
export interface IncomingEventSessions {
  getExistingSession(options: {
    projectId: string;
    profileId: string;
  }): Promise<IClickhouseSession | null>;
  ingest(
    payload: IServiceCreateEventPayload
  ): Promise<SessionIngestResult | null>;
}

/**
 * Injected so V1's worker keeps incrementing its own registry's counters
 * while core's registry owns the V2 ones (ingest.metrics.ts).
 */
export interface IncomingEventMetrics {
  sessionStarted(kind: 'new' | 'boundary'): void;
  sessionEndEnqueued(source: 'boundary'): void;
  /** One event whose producer-minted id had already been seen (M21-001). */
  duplicateMarked(): void;
}

export interface IncomingEventDeps {
  /** Already scoped to the message's requestId; the handler only adds the
   *  Kafka delivery coordinates to it. */
  logger: Logger;
  sessions: IncomingEventSessions;
  createEvent(
    payload: IServiceCreateEventPayloadWithId
  ): Promise<{ document: unknown } | unknown>;
  checkNotificationRulesForEvent(
    payload: IServiceCreateEventPayload
  ): Promise<unknown>;
  projects: {
    getCached(projectId: string): Promise<IncomingEventProject | null>;
    /** Conditional update + cache clear; idempotent across workers. */
    markFirstEvent(projectId: string): Promise<unknown>;
  };
  enqueueSessionEnd(input: EnqueueSessionEndInput): Promise<unknown>;
  /**
   * Claim the producer-minted event id. Resolves true when the id has been
   * seen before — a redelivery — and false on its first sighting.
   *
   * MARK, NOT DEDUPE: the caller counts and logs, and inserts the event
   * either way. It may reject; the caller then processes the event normally.
   */
  markDuplicate(eventId: string): Promise<boolean>;
  metrics: IncomingEventMetrics;
}

/**
 * The one lookup a work scope cannot supply, resolved once at the composition
 * root (`apps/api`'s main.ts) rather than per message.
 *
 * M15-005 removed the other two: `getProjectByIdCached` is now a module-scope
 * `cacheablePerDb` keyed on the Postgres client, so the message's own scope
 * reaches the same process-lived cache ingest, http and mcp read.
 */
export interface IncomingEventBindings {
  /**
   * BullMQ-producer orchestration (notification/src/notification-dispatch.ts).
   * Injected rather than imported so the hot path's per-message handler keeps
   * the notification module out of its own import graph. Takes the message's
   * own scope: an enqueue made here carries that message's requestId.
   */
  checkNotificationRulesForEvent(
    deps: Ctx,
    payload: IServiceCreateEventPayload
  ): Promise<unknown>;
  /**
   * `@openpanel/redis`'s `createDuplicateEventMarker`, already bound to the
   * TTL `apps/api` parsed. Injected rather than built here because the TTL is
   * configuration and `packages/core` reads no environment (ADR-022 R7), and
   * because building it once at the composition root keeps the key prefix and
   * the TTL out of the per-message path.
   */
  markDuplicateEvent(eventId: string): Promise<boolean>;
}

/**
 * Binds `IncomingEventDeps` to one message's scope. Synchronous by design —
 * the hot path gets no per-message `await` it did not already have.
 */
export function createIncomingEventDeps(
  ctx: Ctx,
  bindings: IncomingEventBindings
): IncomingEventDeps {
  return {
    logger: ctx.logger,
    sessions: ctx.buffers.session,
    createEvent: (payload) => createEvent(ctx, payload),
    checkNotificationRulesForEvent: (payload) =>
      bindings.checkNotificationRulesForEvent(ctx, payload),
    projects: {
      getCached: (projectId) => getProjectByIdCached(ctx, projectId),
      markFirstEvent: async (projectId) => {
        await ctx.db.project.updateMany({
          where: { id: projectId, firstEventAt: null },
          data: { firstEventAt: new Date() },
        });
        await getProjectByIdCached.clear(ctx, projectId);
      },
    },
    enqueueSessionEnd: (input) => ctx.services.session.enqueueSessionEnd(input),
    markDuplicate: (eventId) => bindings.markDuplicateEvent(eventId),
    metrics: {
      sessionStarted: (kind) => sessionsStarted.inc({ kind }),
      sessionEndEnqueued: (source) => sessionEndsEnqueued.inc({ source }),
      duplicateMarked: () => duplicateEventsMarkedTotal.inc(),
    },
  };
}

async function isEventExcludedByProjectFilter(
  payload: IServiceCreateEventPayload,
  projectId: string,
  deps: IncomingEventDeps
): Promise<boolean> {
  const project = await deps.projects.getCached(projectId);
  const eventExcludeFilters = (project?.filters ?? []).filter(
    (f) => f.type === 'event'
  );
  if (eventExcludeFilters.length === 0) {
    return false;
  }
  return eventExcludeFilters.some((filter) => matchEvent(payload, filter));
}

/**
 * Records the project's first-ever event timestamp exactly once. The cached
 * project read makes this a no-op on every event after the first; the
 * conditional update keeps concurrent workers idempotent.
 */
async function markFirstEvent(
  projectId: string,
  logger: Logger,
  deps: IncomingEventDeps
) {
  const project = await deps.projects.getCached(projectId);
  if (!project || project.firstEventAt) {
    return;
  }
  await deps.projects.markFirstEvent(projectId);
  logger.info({ projectId }, 'Project received its first event');
}

async function createEventAndNotify(
  payload: IServiceCreateEventPayloadWithId,
  logger: Logger,
  projectId: string,
  deps: IncomingEventDeps
) {
  const isExcluded = await isEventExcludedByProjectFilter(
    payload,
    projectId,
    deps
  );
  if (isExcluded) {
    logger.info(
      { event: payload.name, projectId },
      'Event excluded by project filter'
    );
    return null;
  }

  logger.info({ event: payload }, 'Creating event');
  const [event] = await Promise.all([
    deps.createEvent(payload),
    deps.checkNotificationRulesForEvent(payload).catch(() => null),
  ]);
  // Only after the event is accepted — recording the first event before a
  // failed createEvent would leave the activation checklist claiming data
  // arrived that was never persisted.
  await markFirstEvent(projectId, logger, deps).catch(() => null);
  return event;
}

const parseRevenue = (revenue: unknown): number | undefined => {
  if (!revenue) {
    return undefined;
  }
  if (typeof revenue === 'number') {
    return revenue;
  }
  if (typeof revenue === 'string') {
    const parsed = Number.parseFloat(revenue);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
};

/**
 * Claim the event id and report a redelivery. THE EVENT IS INSERTED EITHER
 * WAY — this counts and logs, it does not drop, and nothing downstream reads
 * its answer. A false positive on a suppressing check would be silent data
 * loss, and whether the events table ever gets dedupe is not decided here.
 *
 * It replaces the offset watermark, which could not see a duplicate across a
 * rebalance, an eviction, a durability redelivery or a restart — drill 08
 * measured 161 real duplicates and 0 of them flagged. It catches redeliveries
 * of the SAME id: crash, eviction, durability redelivery. It does NOT catch
 * drill 06's lost ACK, where the SDK re-sends and the producer mints a fresh
 * id per request; SDK-supplied ids are what closes that, later.
 *
 * FAILS OPEN, AND NEVER REJECTS. Redis being away is exactly when redeliveries
 * happen, so an observability counter must not be the thing that delays or
 * loses an event — and a handler blocked on Redis is how drill 02's consumer
 * was evicted past its session timeout, which is the one reassignment M19
 * measured costing duplicate rows.
 */
function startDuplicateMark(
  eventId: string | undefined,
  projectId: string,
  logger: Logger,
  deps: IncomingEventDeps
): Promise<void> {
  if (!eventId) {
    return Promise.resolve();
  }
  return deps
    .markDuplicate(eventId)
    .then((seenBefore) => {
      if (!seenBefore) {
        return;
      }
      deps.metrics.duplicateMarked();
      logger.warn(
        { eventId, projectId },
        'DUPLICATE event id — already ingested, inserting it anyway'
      );
    })
    .catch((error) => {
      logger.warn(
        { err: error, eventId },
        'could not mark duplicate — this event is unchecked'
      );
    });
}

export async function incomingEvent(
  jobPayload: IncomingEventPayload,
  deps: IncomingEventDeps,
  // Logged so a duplicate row in ClickHouse can be traced back to the exact
  // partition/offset that produced it.
  meta?: IncomingEventDelivery
) {
  // `requestId` rides in on `deps.logger`, which the consumer scopes to this
  // envelope's id (ADR-018 R1 renames V1's `reqId`); only the delivery
  // coordinates are per-message news.
  const logger = meta
    ? deps.logger.child({
        kafkaPartition: meta.partition,
        kafkaOffset: meta.offset,
      })
    : deps.logger;
  // Started BEFORE the handler's own Redis work and awaited AFTER it, so the
  // marker's round trip overlaps the session buffer's GET and EVAL on the same
  // client: healthy it costs the handler nothing measurable, and under a
  // frozen Redis its bound is one the handler was already paying.
  const duplicateMark = startDuplicateMark(
    jobPayload.id,
    jobPayload.projectId,
    logger,
    deps
  );
  try {
    return await ingestIncomingEvent(jobPayload, deps, logger);
  } finally {
    await duplicateMark;
  }
}

async function ingestIncomingEvent(
  jobPayload: IncomingEventPayload,
  deps: IncomingEventDeps,
  logger: Logger
) {
  const {
    geo,
    event: body,
    headers,
    projectId,
    deviceId,
    sessionId,
    uaInfo,
    // Producer-minted; a redelivered message re-creates the same row id.
    // Absent on messages produced before the field existed — createEvent then
    // falls back to a fresh uuid.
    id: eventId,
  } = jobPayload;
  const properties: Record<string, unknown> = body.properties ?? {};
  const getProperty = (name: string): string | undefined => {
    // replace thing is just for older sdks when we didn't have `__`
    // remove when kiddokitchen app (24.09.02) is not used anymore
    return (
      ((properties[name] || properties[name.replace('__', '')]) as
        | string
        | null
        | undefined) ?? undefined
    );
  };

  const profileId = body.profileId ? String(body.profileId) : '';
  const createdAt = new Date(body.timestamp);
  const isTimestampFromThePast = body.isTimestampFromThePast;
  const url = getProperty('__path');
  const { path, hash, query, origin } = parsePath(url);
  const referrer = isSameDomain(getProperty('__referrer'), url)
    ? null
    : parseReferrer(getProperty('__referrer'));
  const utmReferrer = getReferrerWithQuery(query);
  // Typed as a plain record so `omit`'s key set is `string`, not the two
  // literal keys the spread would otherwise infer.
  const eventProperties: Record<string, unknown> = {
    ...properties,
    __hash: hash,
    __query: query,
  };
  const sdkName = headers['openpanel-sdk-name'];
  const sdkVersion = headers['openpanel-sdk-version'];

  const baseEvent: IServiceCreateEventPayload = {
    name: body.name,
    profileId,
    projectId,
    deviceId,
    sessionId,
    properties: omit(GLOBAL_PROPERTIES, eventProperties),
    groups: body.groups ?? [],
    createdAt,
    duration: 0,
    sdkName,
    sdkVersion,
    city: geo.city,
    country: geo.country,
    region: geo.region,
    longitude: geo.longitude,
    latitude: geo.latitude,
    path,
    origin,
    referrer: referrer?.url || '',
    referrerName: utmReferrer?.name || referrer?.name || referrer?.url,
    referrerType: utmReferrer?.type || referrer?.type || '',
    os: uaInfo.os,
    osVersion: uaInfo.osVersion,
    browser: uaInfo.browser,
    browserVersion: uaInfo.browserVersion,
    device: uaInfo.device,
    brand: uaInfo.brand,
    model: uaInfo.model,
    revenue:
      body.name === 'revenue' && '__revenue' in properties
        ? parseRevenue(properties.__revenue)
        : undefined,
  };

  // Server-side and "timestamp from the past" events ride alongside an
  // existing client session if there is one — they don't open / close
  // sessions of their own.
  if (uaInfo.isServer || isTimestampFromThePast) {
    const session =
      profileId && !isTimestampFromThePast
        ? await deps.sessions.getExistingSession({ profileId, projectId })
        : null;

    const payload = {
      ...baseEvent,
      deviceId: session?.device_id ?? '',
      sessionId: session?.id ?? '',
      referrer: session?.referrer ?? undefined,
      referrerName: session?.referrer_name ?? undefined,
      referrerType: session?.referrer_type ?? undefined,
      path: session?.exit_path ?? baseEvent.path,
      origin: session?.exit_origin ?? baseEvent.origin,
      os: session?.os ?? baseEvent.os,
      osVersion: session?.os_version ?? baseEvent.osVersion,
      browserVersion: session?.browser_version ?? baseEvent.browserVersion,
      browser: session?.browser ?? baseEvent.browser,
      device: session?.device ?? baseEvent.device,
      brand: session?.brand ?? baseEvent.brand,
      model: session?.model ?? baseEvent.model,
      city: session?.city ?? baseEvent.city,
      country: session?.country ?? baseEvent.country,
      region: session?.region ?? baseEvent.region,
      longitude: session?.longitude ?? baseEvent.longitude,
      latitude: session?.latitude ?? baseEvent.latitude,
    };

    return createEventAndNotify(
      { ...(payload as IServiceEvent), id: eventId },
      logger,
      projectId,
      deps
    );
  }

  if (await isEventExcludedByProjectFilter(baseEvent, projectId, deps)) {
    logger.info(
      { event: baseEvent.name, projectId },
      'Skipping session_start and event (excluded by project filter)'
    );
    return null;
  }

  // The single source of truth for session lifecycle. Reads the current
  // session, decides extend/new/boundary, writes back. The returned
  // `current` is the canonical session — use its referrer fields for
  // inheritance, just like the previous behavior.
  const session = await deps.sessions.ingest(baseEvent);

  if (session?.kind === 'boundary') {
    // Close the old session in a separate job (one Redis-buffered insert
    // for the session_end event + notification rule check). Idempotent via
    // BullMQ jobId dedup.
    await deps
      .enqueueSessionEnd({
        payload: baseEvent,
        closedSession: session.closed,
      })
      .then(() => deps.metrics.sessionEndEnqueued('boundary'))
      .catch((error) => {
        logger.error(
          { err: error, deviceId, sessionId: session.closed.id },
          'Error enqueueing session_end on boundary'
        );
      });
  }

  if (session?.kind === 'new' || session?.kind === 'boundary') {
    deps.metrics.sessionStarted(session.kind);
    // No `id` here: session_start is a second, derived row and must not share
    // the producer-minted id of the event that triggered it.
    await createEventAndNotify(
      {
        ...baseEvent,
        name: 'session_start',
        createdAt: new Date(
          getTime(baseEvent.createdAt) - SESSION_START_OFFSET_MS
        ),
      },
      logger,
      projectId,
      deps
    ).catch((error) => {
      logger.error(
        { err: error, event: baseEvent },
        'Error creating session start event'
      );
      throw error;
    });
  }

  // Inherit referrer fields from the canonical session for the actual event.
  // For 'extend' this preserves the original session's referrer across
  // mid-session events; for 'new' / 'boundary' it's the event's own referrer
  // (which `ingest` just stored on the fresh session).
  const finalPayload: IServiceCreateEventPayload = session
    ? merge(baseEvent, {
        referrer: session.current.referrer,
        referrerName: session.current.referrer_name,
        referrerType: session.current.referrer_type,
      } as Partial<IServiceCreateEventPayload>)
    : baseEvent;

  return createEventAndNotify(
    { ...finalPayload, id: eventId },
    logger,
    projectId,
    deps
  );
}

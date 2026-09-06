// Ported from apps/worker/src/jobs/events.incoming-event.ts (M8-003): the
// Kafka consumer's per-message handler — the step that turns one topic
// payload into session lifecycle decisions and ClickHouse rows. V1's job file
// stays (DELEGATE PATTERN) and calls this until apps/worker dies (P9).
//
// Everything that touches Redis, Postgres, ClickHouse or a queue is INJECTED
// (`IncomingEventDeps`), the way session-end.ts does it: the tests then drive
// the real code with recording doubles instead of `mock.module`, and V1 keeps
// handing in its own buffers, counters and `sessionsQueue` producer so its
// behaviour and its `/metrics` body are unchanged.
//
// createEvent is a static import for the reason session.service.ts's header
// gives: a dynamic edge here closes a dynamic-import cycle that panics
// rolldown when apps/worker bundles the workspace.

import { getTime, isSameDomain, parsePath } from '@openpanel/common';
import type { IProjectFilters } from '@openpanel/validation';
import { anyPass, isEmpty, isNil, mergeDeepRight, omit, reject } from 'ramda';
import { loadDbBuffers } from '../../../buffers/lazy-db-buffers';
import type { SessionIngestResult } from '../../../buffers/session-buffer';
import type { Logger } from '../../../logger';
import type { ServiceDeps } from '../../../services';
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

// project.service.ts's `getProjectByIdCached` takes `ServiceDeps` now
// (M10-004), and its `.clear()` LRU-invalidation must hit the SAME cache
// instance ingest/http/mcp all read — see that file's header — so this
// reaches the v1-compat singleton instead. Previously a STATIC import for a
// rolldown-chunking reason tied to apps/worker's bundle: apps/worker is
// gone (M9) and apps/api ships with no bundler at all (ADR-010), so that
// constraint no longer applies — GENUINE CYCLE, kept lazy, same as every
// other one in this wave: services.ts -> ingest.service.ts -> this file ->
// v1-compat.ts -> services.ts.
function loadProjectService() {
  return import('../../../v1-compat');
}

import type { IClickhouseSession } from '../../session/session.service';
import { sessionEndsEnqueued } from '../../session/src/session.metrics';
import type { EnqueueSessionEndInput } from '../../session/src/session-end';
import type { IncomingEventPayload } from './incoming-event';
import { sessionsStarted } from './ingest.metrics';

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
interface IncomingEventProject {
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
}

export interface IncomingEventDeps {
  /** Base logger; the handler child()s it per message. */
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
  metrics: IncomingEventMetrics;
}

/**
 * Binds `IncomingEventDeps` to the real implementations. db/ch access stays
 * lazy — see event.service.ts's header.
 */
export async function loadIncomingEventDeps(
  deps: ServiceDeps,
  logger: Logger,
  enqueueSessionEnd: (input: EnqueueSessionEndInput) => Promise<unknown>,
  overrides: Partial<IncomingEventDeps> = {}
): Promise<IncomingEventDeps> {
  const [{ sessionBuffer }, { db }, notifications, projectService] =
    await Promise.all([
      loadDbBuffers(),
      import('@openpanel/db/src/prisma-client'),
      import('@openpanel/queue/src/notification-dispatch'),
      loadProjectService(),
    ]);
  return {
    logger,
    sessions: sessionBuffer,
    createEvent: (payload) => createEvent(deps, payload),
    checkNotificationRulesForEvent:
      notifications.checkNotificationRulesForEvent,
    projects: {
      getCached: projectService.getProjectByIdCached,
      markFirstEvent: async (projectId) => {
        await db.project.updateMany({
          where: { id: projectId, firstEventAt: null },
          data: { firstEventAt: new Date() },
        });
        await projectService.clearProjectByIdCache(projectId);
      },
    },
    enqueueSessionEnd,
    metrics: {
      sessionStarted: (kind) => sessionsStarted.inc({ kind }),
      sessionEndEnqueued: (source) => sessionEndsEnqueued.inc({ source }),
    },
    ...overrides,
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

export async function incomingEvent(
  jobPayload: IncomingEventPayload,
  deps: IncomingEventDeps,
  // Logged so a duplicate row in ClickHouse can be traced back to the exact
  // partition/offset that produced it.
  meta?: IncomingEventDelivery
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
  const reqId = headers['request-id'] ?? 'unknown';
  const logger = deps.logger.child({
    reqId,
    ...(meta
      ? { kafkaPartition: meta.partition, kafkaOffset: meta.offset }
      : {}),
  });
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

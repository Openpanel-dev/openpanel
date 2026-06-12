import { getTime, isSameDomain, parsePath } from '@openpanel/common';
import { getReferrerWithQuery, parseReferrer } from '@openpanel/common/server';
import type { IServiceCreateEventPayload, IServiceEvent } from '@openpanel/db';
import {
  checkNotificationRulesForEvent,
  createEvent,
  getProjectByIdCached,
  matchEvent,
  sessionBuffer,
} from '@openpanel/db';
import type { ILogger } from '@openpanel/logger';
import type { EventsQueuePayloadIncomingEvent } from '@openpanel/queue';
import { anyPass, isEmpty, isNil, mergeDeepRight, omit, reject } from 'ramda';
import { sessionEndsEnqueued, sessionsStarted } from '@/metrics';
import { logger as baseLogger } from '@/utils/logger';
import { enqueueSessionEndV2 } from '@/utils/session-handler';

const GLOBAL_PROPERTIES = ['__path', '__referrer', '__timestamp', '__revenue'];

// Strip empty/nullish from B, then deep-merge over A.
const merge = <A, B>(a: Partial<A>, b: Partial<B>): A & B =>
  mergeDeepRight(a, reject(anyPass([isEmpty, isNil]))(b)) as A & B;

async function isEventExcludedByProjectFilter(
  payload: IServiceCreateEventPayload,
  projectId: string
): Promise<boolean> {
  const project = await getProjectByIdCached(projectId);
  const eventExcludeFilters = (project?.filters ?? []).filter(
    (f) => f.type === 'event'
  );
  if (eventExcludeFilters.length === 0) {
    return false;
  }
  return eventExcludeFilters.some((filter) => matchEvent(payload, filter));
}

async function createEventAndNotify(
  payload: IServiceCreateEventPayload,
  logger: ILogger,
  projectId: string
) {
  const isExcluded = await isEventExcludedByProjectFilter(payload, projectId);
  if (isExcluded) {
    logger.info(
      { event: payload.name, projectId },
      'Event excluded by project filter'
    );
    return null;
  }

  logger.info({ event: payload }, 'Creating event');
  const [event] = await Promise.all([
    createEvent(payload),
    checkNotificationRulesForEvent(payload).catch(() => null),
  ]);
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
  jobPayload: EventsQueuePayloadIncomingEvent['payload'],
  // Kafka delivery coordinates, when the event came through the Kafka consumer.
  // Logged so a duplicate row in ClickHouse can be traced back to the exact
  // partition/offset that produced it.
  meta?: { partition: number; offset: string }
) {
  const {
    geo,
    event: body,
    headers,
    projectId,
    deviceId,
    sessionId,
    uaInfo,
  } = jobPayload;
  const properties = body.properties ?? {};
  const reqId = headers['request-id'] ?? 'unknown';
  const logger = baseLogger.child({
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
  const sdkName = headers['openpanel-sdk-name'];
  const sdkVersion = headers['openpanel-sdk-version'];

  const baseEvent: IServiceCreateEventPayload = {
    name: body.name,
    profileId,
    projectId,
    deviceId,
    sessionId,
    properties: omit(GLOBAL_PROPERTIES, {
      ...properties,
      __hash: hash,
      __query: query,
    }),
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
        ? await sessionBuffer.getExistingSession({ profileId, projectId })
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

    return createEventAndNotify(payload as IServiceEvent, logger, projectId);
  }

  if (await isEventExcludedByProjectFilter(baseEvent, projectId)) {
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
  const session = await sessionBuffer.ingest(baseEvent);

  if (session?.kind === 'boundary') {
    // Close the old session in a separate job (one Redis-buffered insert
    // for the session_end event + notification rule check). Idempotent via
    // BullMQ jobId dedup.
    await enqueueSessionEndV2({
      payload: baseEvent,
      closedSession: session.closed,
    })
      .then(() => sessionEndsEnqueued.inc({ source: 'boundary' }))
      .catch((error) => {
        logger.error(
          { err: error, deviceId, sessionId: session.closed.id },
          'Error enqueueing session_end on boundary'
        );
      });
  }

  if (session?.kind === 'new' || session?.kind === 'boundary') {
    sessionsStarted.inc({ kind: session.kind });
    await createEventAndNotify(
      {
        ...baseEvent,
        name: 'session_start',
        createdAt: new Date(getTime(baseEvent.createdAt) - 100),
      },
      logger,
      projectId
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

  return createEventAndNotify(finalPayload, logger, projectId);
}

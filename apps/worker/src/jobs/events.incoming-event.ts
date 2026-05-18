import { getTime, isSameDomain, parsePath } from '@openpanel/common';
import { getReferrerWithQuery, parseReferrer } from '@openpanel/common/server';
import type { IServiceCreateEventPayload } from '@openpanel/db';
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
import { logger as baseLogger } from '@/utils/logger';
import {
  createSessionEndJob,
  extendSessionEndJob,
  getActiveSessionEndJob,
  SESSION_TIMEOUT,
} from '@/utils/session-handler';

const GLOBAL_PROPERTIES = ['__path', '__referrer', '__timestamp', '__revenue'];

// This function will merge two objects.
// First it will strip '' and undefined/null from B
// Then it will merge the two objects with a standard ramda merge function
const merge = <A, B>(a: Partial<A>, b: Partial<B>): A & B =>
  mergeDeepRight(a, reject(anyPass([isEmpty, isNil]))(b)) as A & B;

/** Check if payload matches project-level event exclude filters */
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
  // Check project-level event exclude filters
  const isExcluded = await isEventExcludedByProjectFilter(payload, projectId);
  if (isExcluded) {
    logger.info(
      { event: payload.name, projectId },
      'Event excluded by project filter',
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
    if (Number.isNaN(parsed)) {
      return undefined;
    }
    return parsed;
  }
  return undefined;
};

export async function incomingEvent(
  jobPayload: EventsQueuePayloadIncomingEvent['payload']
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

  // this will get the profileId from the alias table if it exists
  const profileId = body.profileId ? String(body.profileId) : '';
  const createdAt = new Date(body.timestamp);
  // "Live" = the event is recent enough that it could plausibly belong to
  // an active in-memory session. We use the same window as SESSION_TIMEOUT
  // (30 min) so historical events never push the live sessionEnd job
  // forward or create new live sessions. Server-side events are always
  // treated as non-live (they get session enrichment from sessionBuffer
  // when a profile is supplied; otherwise they keep the API-computed id).
  const isLiveEvent =
    !uaInfo.isServer && Date.now() - createdAt.getTime() <= SESSION_TIMEOUT;
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

  // Server-side events: when a profileId is supplied, enrich from the
  // user's most recent browser session (deviceId, sessionId, geo, UA, path,
  // referrer). Without a session, fall back to the API-computed identity.
  // Server events never create or extend live sessions in Redis.
  if (uaInfo.isServer) {
    const enrichment = profileId
      ? await sessionBuffer.getExistingSession({ profileId, projectId })
      : null;

    const payload: IServiceCreateEventPayload = enrichment
      ? {
          ...baseEvent,
          deviceId: enrichment.device_id,
          sessionId: enrichment.id,
          referrer: enrichment.referrer ?? undefined,
          referrerName: enrichment.referrer_name ?? undefined,
          referrerType: enrichment.referrer_type ?? undefined,
          path: enrichment.exit_path ?? baseEvent.path,
          origin: enrichment.exit_origin ?? baseEvent.origin,
          os: enrichment.os ?? baseEvent.os,
          osVersion: enrichment.os_version ?? baseEvent.osVersion,
          browserVersion:
            enrichment.browser_version ?? baseEvent.browserVersion,
          browser: enrichment.browser ?? baseEvent.browser,
          device: enrichment.device ?? baseEvent.device,
          brand: enrichment.brand ?? baseEvent.brand,
          model: enrichment.model ?? baseEvent.model,
          city: enrichment.city ?? baseEvent.city,
          country: enrichment.country ?? baseEvent.country,
          region: enrichment.region ?? baseEvent.region,
          longitude: enrichment.longitude ?? baseEvent.longitude,
          latitude: enrichment.latitude ?? baseEvent.latitude,
        }
      : baseEvent;

    return createEventAndNotify(payload, logger, projectId);
  }

  const activeSessionEndJob = await getActiveSessionEndJob(
    projectId,
    deviceId,
  );
  const activeSessionPayload = activeSessionEndJob?.data.payload;

  const payload: IServiceCreateEventPayload = merge(baseEvent, {
    referrer: activeSessionPayload?.referrer ?? baseEvent.referrer,
    referrerName: activeSessionPayload?.referrerName ?? baseEvent.referrerName,
    referrerType: activeSessionPayload?.referrerType ?? baseEvent.referrerType,
  } as Partial<IServiceCreateEventPayload>) as IServiceCreateEventPayload;

  const isExcluded = await isEventExcludedByProjectFilter(payload, projectId);
  if (isExcluded) {
    logger.info(
      { event: payload.name, projectId },
      'Skipping session_start and event (excluded by project filter)',
    );
    return null;
  }

  // Historical (buffered) events: the API has already computed a
  // deterministic sessionId for them. Write the event but do NOT mutate
  // live session state — historical events shouldn't extend the user's
  // current session or schedule a 30-min sessionEnd timer.
  // Session_start emission for historical buckets lands in a follow-up.
  if (!isLiveEvent) {
    return createEventAndNotify(payload, logger, projectId);
  }

  if (activeSessionEndJob) {
    await extendSessionEndJob({
      projectId,
      deviceId,
      job: activeSessionEndJob,
    }).catch((error) => {
      logger.warn({ err: error }, 'Failed to extend session end job');
    });
  } else {
    await createEventAndNotify(
      {
        ...payload,
        name: 'session_start',
        createdAt: new Date(getTime(payload.createdAt) - 100),
      },
      logger,
      projectId
    ).catch((error) => {
      logger.error(
        { err: error, event: payload },
        'Error creating session start event',
      );
      throw error;
    });

    await createSessionEndJob({ payload }).catch((error) => {
      logger.error(
        { err: error, event: payload },
        'Error creating session end job',
      );
      throw error;
    });
  }

  return createEventAndNotify(payload, logger, projectId);
}

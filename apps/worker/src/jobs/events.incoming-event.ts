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
import { logger as baseLogger } from '@/utils/logger';
import {
  createSessionEndJob,
  extendSessionEndJob,
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
    logger.info('Event excluded by project filter', {
      event: payload.name,
      projectId,
    });
    return null;
  }

  logger.info('Creating event', { event: payload });
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
    session,
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

  // if timestamp is from the past we dont want to create a new session
  if (uaInfo.isServer || isTimestampFromThePast) {
    const session =
      profileId && !isTimestampFromThePast
        ? await sessionBuffer.getExistingSession({
            profileId,
            projectId,
          })
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

  const payload: IServiceCreateEventPayload = merge(baseEvent, {
    referrer: session?.referrer ?? baseEvent.referrer,
    referrerName: session?.referrerName ?? baseEvent.referrerName,
    referrerType: session?.referrerType ?? baseEvent.referrerType,
  } as Partial<IServiceCreateEventPayload>) as IServiceCreateEventPayload;

  const isExcluded = await isEventExcludedByProjectFilter(payload, projectId);
  if (isExcluded) {
    logger.info(
      'Skipping session_start and event (excluded by project filter)',
      { event: payload.name, projectId }
    );
    return null;
  }

  if (session) {
    await extendSessionEndJob({
      projectId,
      deviceId,
    }).catch((error) => {
      logger.error('Error finding and extending session end job', { error });
      throw error;
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
      logger.error('Error creating session start event', { event: payload });
      throw error;
    });

    await createSessionEndJob({ payload }).catch((error) => {
      logger.error('Error creating session end job', { event: payload });
      throw error;
    });
  }

  return createEventAndNotify(payload, logger, projectId);
}

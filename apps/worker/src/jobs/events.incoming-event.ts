import { logger as baseLogger } from '@/utils/logger';
import { createSessionEndJob, getSessionEnd } from '@/utils/session-handler';
import { getTime, isSameDomain, parsePath } from '@openpanel/common';
import {
  getReferrerWithQuery,
  parseReferrer,
  parseUserAgent,
} from '@openpanel/common/server';
import type { IServiceCreateEventPayload, IServiceEvent } from '@openpanel/db';
import {
  checkNotificationRulesForEvent,
  createEvent,
  sessionBuffer,
} from '@openpanel/db';
import type { ILogger } from '@openpanel/logger';
import type { EventsQueuePayloadIncomingEvent } from '@openpanel/queue';
import * as R from 'ramda';
import { v4 as uuid } from 'uuid';

const GLOBAL_PROPERTIES = ['__path', '__referrer', '__timestamp', '__revenue'];

// This function will merge two objects.
// First it will strip '' and undefined/null from B
// Then it will merge the two objects with a standard ramda merge function
const merge = <A, B>(a: Partial<A>, b: Partial<B>): A & B =>
  R.mergeDeepRight(a, R.reject(R.anyPass([R.isEmpty, R.isNil]))(b)) as A & B;

async function createEventAndNotify(
  payload: IServiceCreateEventPayload,
  logger: ILogger,
) {
  logger.info('Creating event', { event: payload });
  const [event] = await Promise.all([
    createEvent(payload),
    checkNotificationRulesForEvent(payload).catch(() => {}),
  ]);
  return event;
}

const parseRevenue = (revenue: unknown): number | undefined => {
  if (!revenue) return undefined;
  if (typeof revenue === 'number') return revenue;
  if (typeof revenue === 'string') {
    const parsed = Number.parseFloat(revenue);
    if (Number.isNaN(parsed)) return undefined;
    return parsed;
  }
  return undefined;
};

export async function incomingEvent(
  jobPayload: EventsQueuePayloadIncomingEvent['payload'],
) {
  const {
    geo,
    event: body,
    headers,
    projectId,
    currentDeviceId,
    previousDeviceId,
    uaInfo: _uaInfo,
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
  const userAgent = headers['user-agent'];
  const sdkName = headers['openpanel-sdk-name'];
  const sdkVersion = headers['openpanel-sdk-version'];
  // TODO: Remove both user-agent and parseUserAgent
  const uaInfo = _uaInfo ?? parseUserAgent(userAgent, properties);

  const baseEvent = {
    name: body.name,
    profileId,
    projectId,
    properties: R.omit(GLOBAL_PROPERTIES, {
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
    referrerName: utmReferrer?.name || referrer?.name || '',
    referrerType: referrer?.type || utmReferrer?.type || '',
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
  } as const;

  // if timestamp is from the past we dont want to create a new session
  if (uaInfo.isServer || isTimestampFromThePast) {
    const session = profileId
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

    return createEventAndNotify(payload as IServiceEvent, logger);
  }

  const sessionEnd = await getSessionEnd({
    projectId,
    currentDeviceId,
    previousDeviceId,
    profileId,
  });

  const lastScreenView = sessionEnd
    ? await sessionBuffer.getExistingSession({
        sessionId: sessionEnd.sessionId,
      })
    : null;

  const payload: IServiceCreateEventPayload = merge(baseEvent, {
    deviceId: sessionEnd?.deviceId ?? currentDeviceId,
    sessionId: sessionEnd?.sessionId ?? uuid(),
    referrer: sessionEnd?.referrer ?? baseEvent.referrer,
    referrerName: sessionEnd?.referrerName ?? baseEvent.referrerName,
    referrerType: sessionEnd?.referrerType ?? baseEvent.referrerType,
    // if the path is not set, use the last screen view path
    path: baseEvent.path || lastScreenView?.exit_path || '',
    origin: baseEvent.origin || lastScreenView?.exit_origin || '',
  } as Partial<IServiceCreateEventPayload>) as IServiceCreateEventPayload;

  if (!sessionEnd) {
    logger.info('Creating session start event', { event: payload });
    await createEventAndNotify(
      {
        ...payload,
        name: 'session_start',
        createdAt: new Date(getTime(payload.createdAt) - 100),
      },
      logger,
    ).catch((error) => {
      logger.error('Error creating session start event', { event: payload });
      throw error;
    });
  }

  const event = await createEventAndNotify(payload, logger);

  if (!sessionEnd) {
    logger.info('Creating session end job', { event: payload });
    await createSessionEndJob({ payload }).catch((error) => {
      logger.error('Error creating session end job', { event: payload });
      throw error;
    });
  }

  return event;
}

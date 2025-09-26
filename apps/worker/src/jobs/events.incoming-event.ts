import { logger as baseLogger } from '@/utils/logger';
import { getReferrerWithQuery, parseReferrer } from '@/utils/parse-referrer';
import {
  createSessionEndJob,
  createSessionStart,
  getSessionEnd,
} from '@/utils/session-handler';
import { isSameDomain, parsePath } from '@openpanel/common';
import { parseUserAgent } from '@openpanel/common/server';
import type { IServiceCreateEventPayload, IServiceEvent } from '@openpanel/db';
import {
  checkNotificationRulesForEvent,
  createEvent,
  eventBuffer,
} from '@openpanel/db';
import type { ILogger } from '@openpanel/logger';
import type { EventsQueuePayloadIncomingEvent } from '@openpanel/queue';
import { getLock } from '@openpanel/redis';
import { DelayedError, type Job } from 'bullmq';
import { omit } from 'ramda';
import * as R from 'ramda';
import { v4 as uuid } from 'uuid';

const GLOBAL_PROPERTIES = ['__path', '__referrer'];

// This function will merge two objects.
// First it will strip '' and undefined/null from B
// Then it will merge the two objects with a standard ramda merge function
const merge = <A, B>(a: Partial<A>, b: Partial<B>): A & B =>
  R.mergeDeepRight(a, R.reject(R.anyPass([R.isEmpty, R.isNil]))(b)) as A & B;

async function createEventAndNotify(
  payload: IServiceCreateEventPayload,
  jobData: Job<EventsQueuePayloadIncomingEvent>['data']['payload'],
  logger: ILogger,
) {
  logger.info('Creating event', { event: payload, jobData });
  const [event] = await Promise.all([
    createEvent(payload),
    checkNotificationRulesForEvent(payload),
  ]);
  return event;
}

export async function incomingEvent(
  job: Job<EventsQueuePayloadIncomingEvent>,
  token?: string,
) {
  const {
    geo,
    event: body,
    headers,
    projectId,
    currentDeviceId,
    previousDeviceId,
  } = job.data.payload;
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
  const uaInfo = parseUserAgent(userAgent, properties);

  const baseEvent = {
    name: body.name,
    profileId,
    projectId,
    properties: omit(GLOBAL_PROPERTIES, {
      ...properties,
      __user_agent: userAgent,
      __hash: hash,
      __query: query,
      __reqId: reqId,
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
    referrer: utmReferrer?.url || referrer?.url || '',
    referrerName: utmReferrer?.name || referrer?.name || '',
    referrerType: utmReferrer?.type || referrer?.type || '',
    os: uaInfo.os,
    osVersion: uaInfo.osVersion,
    browser: uaInfo.browser,
    browserVersion: uaInfo.browserVersion,
    device: uaInfo.device,
    brand: uaInfo.brand,
    model: uaInfo.model,
  } as const;

  // if timestamp is from the past we dont want to create a new session
  if (uaInfo.isServer || isTimestampFromThePast) {
    const screenView = profileId
      ? await eventBuffer.getLastScreenView({
          profileId,
          projectId,
        })
      : null;

    const payload = {
      ...baseEvent,
      deviceId: screenView?.deviceId ?? '',
      sessionId: screenView?.sessionId ?? '',
      referrer: screenView?.referrer ?? undefined,
      referrerName: screenView?.referrerName ?? undefined,
      referrerType: screenView?.referrerType ?? undefined,
      path: screenView?.path ?? baseEvent.path,
      os: screenView?.os ?? baseEvent.os,
      osVersion: screenView?.osVersion ?? baseEvent.osVersion,
      browserVersion: screenView?.browserVersion ?? baseEvent.browserVersion,
      browser: screenView?.browser ?? baseEvent.browser,
      device: screenView?.device ?? baseEvent.device,
      brand: screenView?.brand ?? baseEvent.brand,
      model: screenView?.model ?? baseEvent.model,
      city: screenView?.city ?? baseEvent.city,
      country: screenView?.country ?? baseEvent.country,
      region: screenView?.region ?? baseEvent.region,
      longitude: screenView?.longitude ?? baseEvent.longitude,
      latitude: screenView?.latitude ?? baseEvent.latitude,
      origin: screenView?.origin ?? baseEvent.origin,
    };

    return createEventAndNotify(
      payload as IServiceEvent,
      job.data.payload,
      logger,
    );
  }

  const sessionEnd = await getSessionEnd({
    projectId,
    currentDeviceId,
    previousDeviceId,
    profileId,
  });

  const lastScreenView = sessionEnd
    ? await eventBuffer.getLastScreenView({
        projectId,
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
    path: baseEvent.path || lastScreenView?.path || '',
    origin: baseEvent.origin || lastScreenView?.origin || '',
  } as Partial<IServiceCreateEventPayload>) as IServiceCreateEventPayload;

  if (!sessionEnd) {
    // Too avoid several created sessions we just throw if a lock exists
    // This will than retry the job
    const lock = await getLock(
      `create-session-end:${currentDeviceId}`,
      'locked',
      1000,
    );

    if (!lock) {
      logger.warn('Move incoming event to delayed');
      await job.moveToDelayed(Date.now() + 50, token);
      throw new DelayedError();
    }
    await createSessionStart({ payload });
  }

  const event = await createEventAndNotify(payload, job.data.payload, logger);

  if (!sessionEnd) {
    await createSessionEndJob({ payload });
  }

  return event;
}

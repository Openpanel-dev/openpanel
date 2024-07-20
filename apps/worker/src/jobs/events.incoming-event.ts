import { getReferrerWithQuery, parseReferrer } from '@/utils/parse-referrer';
import { parseUserAgent } from '@/utils/parse-user-agent';
import { isSameDomain, parsePath } from '@/utils/url';
import type { Job } from 'bullmq';
import { omit } from 'ramda';
import { v4 as uuid } from 'uuid';

import { getTime, toISOString } from '@openpanel/common';
import type { IServiceCreateEventPayload } from '@openpanel/db';
import { createEvent } from '@openpanel/db';
import { getLastScreenViewFromProfileId } from '@openpanel/db/src/services/event.service';
import { eventsQueue, findJobByPrefix, sessionsQueue } from '@openpanel/queue';
import type {
  EventsQueuePayloadCreateSessionEnd,
  EventsQueuePayloadIncomingEvent,
} from '@openpanel/queue';
import { redis } from '@openpanel/redis';

function noDateInFuture(eventDate: Date): Date {
  if (eventDate > new Date()) {
    return new Date();
  } else {
    return eventDate;
  }
}

const GLOBAL_PROPERTIES = ['__path', '__referrer'];
const SESSION_TIMEOUT = 1000 * 60 * 30;
const SESSION_END_TIMEOUT = SESSION_TIMEOUT + 1000;

export async function incomingEvent(job: Job<EventsQueuePayloadIncomingEvent>) {
  const {
    geo,
    event: body,
    headers,
    projectId,
    currentDeviceId,
    previousDeviceId,
    priority,
  } = job.data.payload;
  const properties = body.properties ?? {};
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
  const createdAt = noDateInFuture(new Date(body.timestamp));
  const url = getProperty('__path');
  const { path, hash, query, origin } = parsePath(url);
  const referrer = isSameDomain(getProperty('__referrer'), url)
    ? null
    : parseReferrer(getProperty('__referrer'));
  const utmReferrer = getReferrerWithQuery(query);
  const uaInfo = parseUserAgent(headers.ua);

  if (uaInfo.isServer) {
    const event = await getLastScreenViewFromProfileId({
      profileId,
      projectId,
    });

    const payload: Omit<IServiceCreateEventPayload, 'id'> = {
      name: body.name,
      deviceId: event?.deviceId || '',
      sessionId: event?.sessionId || '',
      profileId,
      projectId,
      properties: {
        ...omit(GLOBAL_PROPERTIES, properties),
        user_agent: headers.ua,
      },
      createdAt,
      country: event?.country || geo.country || '',
      city: event?.city || geo.city || '',
      region: event?.region || geo.region || '',
      longitude: geo.longitude,
      latitude: geo.latitude,
      os: event?.os ?? '',
      osVersion: event?.osVersion ?? '',
      browser: event?.browser ?? '',
      browserVersion: event?.browserVersion ?? '',
      device: event?.device ?? uaInfo.device ?? '',
      brand: event?.brand ?? '',
      model: event?.model ?? '',
      duration: 0,
      path: event?.path ?? '',
      origin: event?.origin ?? '',
      referrer: event?.referrer ?? '',
      referrerName: event?.referrerName ?? '',
      referrerType: event?.referrerType ?? '',
      profile: undefined,
      meta: undefined,
    };

    return createEvent(payload);
  }

  const sessionEnd = await getSessionEndWithPriority(priority)({
    projectId,
    currentDeviceId,
    previousDeviceId,
  });

  const sessionEndPayload = (sessionEnd?.job?.data
    ?.payload as EventsQueuePayloadCreateSessionEnd['payload']) || {
    sessionId: uuid(),
    deviceId: currentDeviceId,
    profileId,
    projectId,
  };

  const sessionEndJobId =
    sessionEnd?.job.id ??
    `sessionEnd:${projectId}:${sessionEndPayload.deviceId}:${Date.now()}`;

  if (sessionEnd) {
    // If for some reason we have a session end job that is not a createSessionEnd job
    if (sessionEnd.job.data.type !== 'createSessionEnd') {
      throw new Error('Invalid session end job');
    }

    await sessionEnd.job.changeDelay(SESSION_TIMEOUT);
  } else {
    await sessionsQueue.add(
      'session',
      {
        type: 'createSessionEnd',
        payload: sessionEndPayload,
      },
      {
        delay: SESSION_END_TIMEOUT,
        jobId: sessionEndJobId,
      }
    );
  }

  const payload: Omit<IServiceCreateEventPayload, 'id'> = {
    name: body.name,
    deviceId: sessionEndPayload.deviceId,
    sessionId: sessionEndPayload.sessionId,
    profileId,
    projectId,
    properties: Object.assign({}, omit(GLOBAL_PROPERTIES, properties), {
      __hash: hash,
      __query: query,
    }),
    createdAt,
    country: geo.country,
    city: geo.city,
    region: geo.region,
    longitude: geo.longitude,
    latitude: geo.latitude,
    os: uaInfo?.os ?? '',
    osVersion: uaInfo?.osVersion ?? '',
    browser: uaInfo?.browser ?? '',
    browserVersion: uaInfo?.browserVersion ?? '',
    device: uaInfo?.device ?? '',
    brand: uaInfo?.brand ?? '',
    model: uaInfo?.model ?? '',
    duration: 0,
    path: path,
    origin: origin,
    referrer: referrer?.url,
    referrerName: referrer?.name || utmReferrer?.name || '',
    referrerType: referrer?.type || utmReferrer?.type || '',
    profile: undefined,
    meta: undefined,
  };

  if (!sessionEnd) {
    await createEvent({
      ...payload,
      name: 'session_start',
      // @ts-expect-error
      createdAt: toISOString(getTime(payload.createdAt) - 100),
    });
  }

  return createEvent(payload);
}

function getSessionEndWithPriority(
  priority: boolean,
  count = 0
): typeof getSessionEnd {
  return async (args) => {
    const res = await getSessionEnd(args);

    if (count > 5) {
      throw new Error('Failed to get session end');
    }

    // if we get simultaneous requests we want to avoid race conditions with getting the session end
    // one of the events will get priority and the other will wait for the first to finish
    if (res === null && priority === false) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return getSessionEndWithPriority(priority, count + 1)(args);
    }

    return res;
  };
}

async function getSessionEnd({
  projectId,
  currentDeviceId,
  previousDeviceId,
}: {
  projectId: string;
  currentDeviceId: string;
  previousDeviceId: string;
}) {
  const sessionEndKeys = await redis.keys(`*:sessionEnd:${projectId}:*`);

  const sessionEndJobCurrentDeviceId = await findJobByPrefix(
    sessionsQueue,
    sessionEndKeys,
    `sessionEnd:${projectId}:${currentDeviceId}:`
  );
  if (sessionEndJobCurrentDeviceId) {
    return { deviceId: currentDeviceId, job: sessionEndJobCurrentDeviceId };
  }

  const sessionEndJobCurrentDeviceId2 = await findJobByPrefix(
    eventsQueue,
    sessionEndKeys,
    `sessionEnd:${projectId}:${currentDeviceId}:`
  );
  if (sessionEndJobCurrentDeviceId2) {
    return { deviceId: currentDeviceId, job: sessionEndJobCurrentDeviceId2 };
  }

  const sessionEndJobPreviousDeviceId = await findJobByPrefix(
    sessionsQueue,
    sessionEndKeys,
    `sessionEnd:${projectId}:${previousDeviceId}:`
  );
  if (sessionEndJobPreviousDeviceId) {
    return { deviceId: previousDeviceId, job: sessionEndJobPreviousDeviceId };
  }

  const sessionEndJobPreviousDeviceId2 = await findJobByPrefix(
    eventsQueue,
    sessionEndKeys,
    `sessionEnd:${projectId}:${previousDeviceId}:`
  );
  if (sessionEndJobPreviousDeviceId2) {
    return { deviceId: previousDeviceId, job: sessionEndJobPreviousDeviceId2 };
  }

  // Create session
  return null;
}

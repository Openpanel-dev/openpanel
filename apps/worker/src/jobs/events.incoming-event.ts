import { getReferrerWithQuery, parseReferrer } from '@/utils/parse-referrer';
import type { Job } from 'bullmq';
import { omit } from 'ramda';
import { v4 as uuid } from 'uuid';

import { logger } from '@/utils/logger';
import { getTime, isSameDomain, parsePath } from '@openpanel/common';
import { parseUserAgent } from '@openpanel/common/server';
import type { IServiceCreateEventPayload } from '@openpanel/db';
import { checkNotificationRulesForEvent, createEvent } from '@openpanel/db';
import { getLastScreenViewFromProfileId } from '@openpanel/db/src/services/event.service';
import type {
  EventsQueuePayloadCreateSessionEnd,
  EventsQueuePayloadIncomingEvent,
} from '@openpanel/queue';
import {
  findJobByPrefix,
  sessionsQueue,
  sessionsQueueEvents,
} from '@openpanel/queue';
import { getRedisQueue } from '@openpanel/redis';

const GLOBAL_PROPERTIES = ['__path', '__referrer'];
export const SESSION_TIMEOUT = 1000 * 60 * 30;

const getSessionEndJobId = (projectId: string, deviceId: string) =>
  `sessionEnd:${projectId}:${deviceId}`;

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

  // this will get the profileId from the alias table if it exists
  const profileId = body.profileId ? String(body.profileId) : '';
  const createdAt = new Date(body.timestamp);
  const url = getProperty('__path');
  const { path, hash, query, origin } = parsePath(url);
  const referrer = isSameDomain(getProperty('__referrer'), url)
    ? null
    : parseReferrer(getProperty('__referrer'));
  const utmReferrer = getReferrerWithQuery(query);
  const userAgent = headers['user-agent'];
  const sdkName = headers['openpanel-sdk-name'];
  const sdkVersion = headers['openpanel-sdk-version'];
  const uaInfo = parseUserAgent(userAgent);

  if (uaInfo.isServer) {
    const event = profileId
      ? await getLastScreenViewFromProfileId({
          profileId,
          projectId,
        })
      : null;

    const payload: IServiceCreateEventPayload = {
      name: body.name,
      deviceId: event?.deviceId || '',
      sessionId: event?.sessionId || '',
      profileId,
      projectId,
      properties: {
        ...omit(GLOBAL_PROPERTIES, properties),
        user_agent: userAgent,
      },
      createdAt,
      country: event?.country || geo.country || '',
      city: event?.city || geo.city || '',
      region: event?.region || geo.region || '',
      longitude: event?.longitude || geo.longitude || null,
      latitude: event?.latitude || geo.latitude || null,
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
      sdkName,
      sdkVersion,
    };

    await checkNotificationRulesForEvent(payload);

    return createEvent(payload);
  }

  const sessionEnd = await getSessionEndWithPriority(priority)({
    projectId,
    currentDeviceId,
    previousDeviceId,
  });

  const sessionEndPayload =
    sessionEnd?.job.data.payload ||
    ({
      sessionId: uuid(),
      deviceId: currentDeviceId,
      profileId,
      projectId,
    } satisfies EventsQueuePayloadCreateSessionEnd['payload']);

  const payload: IServiceCreateEventPayload = {
    name: body.name,
    deviceId: sessionEndPayload.deviceId,
    sessionId: sessionEndPayload.sessionId,
    profileId,
    projectId,
    properties: Object.assign({}, omit(GLOBAL_PROPERTIES, properties), {
      user_agent: userAgent,
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
    referrer: sessionEnd ? sessionEndPayload.referrer : referrer?.url || '',
    referrerName: sessionEnd
      ? sessionEndPayload.referrerName
      : referrer?.name || utmReferrer?.name || '',
    referrerType: sessionEnd
      ? sessionEndPayload.referrerType
      : referrer?.type || utmReferrer?.type || '',
    sdkName,
    sdkVersion,
  };

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
        payload,
      },
      {
        delay: SESSION_TIMEOUT,
        jobId: getSessionEndJobId(projectId, sessionEndPayload.deviceId),
      },
    );
  }

  if (!sessionEnd) {
    await createEvent({
      ...payload,
      name: 'session_start',
      createdAt: new Date(getTime(payload.createdAt) - 100),
    });
  }

  await checkNotificationRulesForEvent(payload);

  return createEvent(payload);
}

function getSessionEndWithPriority(
  priority: boolean,
  count = 0,
): typeof getSessionEnd {
  return async (args) => {
    const res = await getSessionEnd(args);

    if (count > 10) {
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
  async function handleJobStates(
    job: Job,
  ): Promise<{ deviceId: string; job: Job } | null> {
    const state = await job.getState();
    if (state === 'delayed') {
      return { deviceId: currentDeviceId, job };
    }

    if (state === 'completed' || state === 'failed') {
      await job.remove();
    }

    if (state === 'active' || state === 'waiting') {
      await job.waitUntilFinished(sessionsQueueEvents, 1000 * 10);
      return getSessionEnd({
        projectId,
        currentDeviceId,
        previousDeviceId,
      });
    }

    return null;
  }

  const job = await sessionsQueue.getJob(
    getSessionEndJobId(projectId, currentDeviceId),
  );
  if (job) {
    const res = await handleJobStates(job);
    if (res) {
      return res;
    }
  }

  const previousJob = await sessionsQueue.getJob(
    getSessionEndJobId(projectId, previousDeviceId),
  );
  if (previousJob) {
    const res = await handleJobStates(previousJob);
    if (res) {
      return res;
    }
  }

  // Fallback during migration period
  const currentSessionEndKeys = await getRedisQueue().keys(
    `bull:sessions:sessionEnd:${projectId}:${currentDeviceId}:*`,
  );

  const sessionEndJobCurrentDeviceId = await findJobByPrefix(
    sessionsQueue,
    currentSessionEndKeys,
    `sessionEnd:${projectId}:${currentDeviceId}:`,
  );
  if (sessionEndJobCurrentDeviceId) {
    logger.info('found session end job for current device (old)');
    return { deviceId: currentDeviceId, job: sessionEndJobCurrentDeviceId };
  }

  const previousSessionEndKeys = await getRedisQueue().keys(
    `bull:sessions:sessionEnd:${projectId}:${previousDeviceId}:*`,
  );

  const sessionEndJobPreviousDeviceId = await findJobByPrefix(
    sessionsQueue,
    previousSessionEndKeys,
    `sessionEnd:${projectId}:${previousDeviceId}:`,
  );
  if (sessionEndJobPreviousDeviceId) {
    logger.info('found session end job for previous device (old)');
    return { deviceId: previousDeviceId, job: sessionEndJobPreviousDeviceId };
  }

  // Create session
  return null;
}

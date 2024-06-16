import { logger } from '@/utils/logger';
import { getReferrerWithQuery, parseReferrer } from '@/utils/parse-referrer';
import { isUserAgentSet, parseUserAgent } from '@/utils/parse-user-agent';
import { isSameDomain, parsePath } from '@/utils/url';
import type { Job, JobsOptions } from 'bullmq';
import { omit } from 'ramda';
import { escape } from 'sqlstring';
import { v4 as uuid } from 'uuid';

import { getTime, toISOString } from '@openpanel/common';
import type { IServiceCreateEventPayload } from '@openpanel/db';
import { createEvent, getEvents } from '@openpanel/db';
import { findJobByPrefix } from '@openpanel/queue';
import { eventsQueue } from '@openpanel/queue/src/queues';
import type { EventsQueuePayloadIncomingEvent } from '@openpanel/queue/src/queues';
import { redis } from '@openpanel/redis';

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
  } = job.data.payload;
  let deviceId: string | null = null;

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
  const { ua } = headers;
  const profileId = body.profileId ?? '';
  const createdAt = new Date(body.timestamp);
  const url = getProperty('__path');
  const { path, hash, query, origin } = parsePath(url);
  const referrer = isSameDomain(getProperty('__referrer'), url)
    ? null
    : parseReferrer(getProperty('__referrer'));
  const utmReferrer = getReferrerWithQuery(query);
  const uaInfo = ua ? parseUserAgent(ua) : null;
  const isServerEvent = ua ? !isUserAgentSet(ua) : true;

  if (isServerEvent) {
    const [event] = await getEvents(
      `SELECT * FROM events WHERE name = 'screen_view' AND profile_id = ${escape(profileId)} AND project_id = ${escape(projectId)} ORDER BY created_at DESC LIMIT 1`
    );

    const payload: Omit<IServiceCreateEventPayload, 'id'> = {
      name: body.name,
      deviceId: event?.deviceId || '',
      sessionId: event?.sessionId || '',
      profileId,
      projectId,
      properties: Object.assign({}, omit(GLOBAL_PROPERTIES, properties)),
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
      device: event?.device ?? '',
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

  const [sessionEndKeys, eventsKeys] = await Promise.all([
    redis.keys(`bull:events:sessionEnd:${projectId}:*`),
    redis.keys(`bull:events:event:${projectId}:*`),
  ]);

  const sessionEndJobCurrentDeviceId = await findJobByPrefix(
    eventsQueue,
    sessionEndKeys,
    `sessionEnd:${projectId}:${currentDeviceId}:`
  );
  const sessionEndJobPreviousDeviceId = await findJobByPrefix(
    eventsQueue,
    sessionEndKeys,
    `sessionEnd:${projectId}:${previousDeviceId}:`
  );

  const createSessionStart =
    !sessionEndJobCurrentDeviceId && !sessionEndJobPreviousDeviceId;

  if (sessionEndJobCurrentDeviceId && !sessionEndJobPreviousDeviceId) {
    deviceId = currentDeviceId;
    const diff = Date.now() - sessionEndJobCurrentDeviceId.timestamp;
    sessionEndJobCurrentDeviceId.changeDelay(diff + SESSION_END_TIMEOUT);
  } else if (!sessionEndJobCurrentDeviceId && sessionEndJobPreviousDeviceId) {
    deviceId = previousDeviceId;
    const diff = Date.now() - sessionEndJobPreviousDeviceId.timestamp;
    sessionEndJobPreviousDeviceId.changeDelay(diff + SESSION_END_TIMEOUT);
  } else {
    deviceId = currentDeviceId;
    // Queue session end
    eventsQueue.add(
      'event',
      {
        type: 'createSessionEnd',
        payload: {
          deviceId,
        },
      },
      {
        delay: SESSION_END_TIMEOUT,
        jobId: `sessionEnd:${projectId}:${deviceId}:${Date.now()}`,
      }
    );
  }

  const prevEventJob = await findJobByPrefix(
    eventsQueue,
    eventsKeys,
    `event:${projectId}:${deviceId}:`
  );

  const [sessionStartEvent] = await getEvents(
    `SELECT * FROM events WHERE name = 'session_start' AND device_id = ${escape(deviceId)} AND project_id = ${escape(projectId)} ORDER BY created_at DESC LIMIT 1`
  );

  const payload: Omit<IServiceCreateEventPayload, 'id'> = {
    name: body.name,
    deviceId,
    profileId,
    projectId,
    sessionId: createSessionStart ? uuid() : sessionStartEvent?.sessionId ?? '',
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

  const isDelayed = prevEventJob ? await prevEventJob?.isDelayed() : false;

  if (isDelayed && prevEventJob && prevEventJob.data.type === 'createEvent') {
    const prevEvent = prevEventJob.data.payload;
    const duration = getTime(payload.createdAt) - getTime(prevEvent.createdAt);
    job.log(`prevEvent ${JSON.stringify(prevEvent, null, 2)}`);

    // Set path from prev screen_view event if current event is not a screen_view
    if (payload.name != 'screen_view') {
      payload.path = prevEvent.path;
    }

    if (payload.name === 'screen_view') {
      if (duration < 0) {
        logger.info({ prevEvent, payload }, 'Duration is negative');
      } else {
        try {
          // Skip update duration if it's wrong
          // Seems like request is not in right order
          await prevEventJob.updateData({
            type: 'createEvent',
            payload: {
              ...prevEvent,
              duration,
            },
          });
        } catch (error) {
          logger.error(
            {
              error,
              prevEventJobStatus: await prevEventJob
                .getState()
                .catch(() => 'unknown'),
            },
            `Failed update delayed job`
          );
        }
      }

      try {
        await prevEventJob.promote();
      } catch (error) {
        logger.error(
          {
            error,
            prevEventJobStatus: await prevEventJob
              .getState()
              .catch(() => 'unknown'),
            prevEvent,
            currEvent: payload,
          },
          `Failed to promote job`
        );
      }
    }
  } else if (payload.name !== 'screen_view') {
    job.log(
      `no previous job ${JSON.stringify(
        {
          prevEventJob,
          payload,
        },
        null,
        2
      )}`
    );
  }

  if (createSessionStart) {
    // We do not need to queue session_start
    await createEvent({
      ...payload,
      name: 'session_start',
      // @ts-expect-error
      createdAt: toISOString(getTime(payload.createdAt) - 100),
    });
  }

  const options: JobsOptions = {};
  if (payload.name === 'screen_view') {
    options.delay = SESSION_TIMEOUT;
    options.jobId = `event:${projectId}:${deviceId}:${Date.now()}`;
  }

  job.log(
    `event is queued ${JSON.stringify(
      {
        ua,
        uaInfo,
        referrer,
        profileId,
        projectId,
        deviceId,
        geo,
        sessionStartEvent,
        path,
        payload,
      },
      null,
      2
    )}`
  );

  // Queue event instead of creating it,
  // since we want to update duration if we get more events in the same session
  // The event will only be delayed if it's a screen_view event
  return eventsQueue.add(
    'event',
    {
      type: 'createEvent',
      payload,
    },
    options
  );
}

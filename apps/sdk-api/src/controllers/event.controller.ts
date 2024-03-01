import { getClientIp, parseIp } from '@/utils/parseIp';
import { getReferrerWithQuery, parseReferrer } from '@/utils/parseReferrer';
import { isUserAgentSet, parseUserAgent } from '@/utils/parseUserAgent';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { omit } from 'ramda';
import { v4 as uuid } from 'uuid';

import { generateDeviceId, getTime, toISOString } from '@mixan/common';
import type { IServiceCreateEventPayload } from '@mixan/db';
import { createEvent, getEvents, getSalts } from '@mixan/db';
import type { JobsOptions } from '@mixan/queue';
import { eventsQueue, findJobByPrefix } from '@mixan/queue';
import type { PostEventPayload } from '@mixan/sdk';

const SESSION_TIMEOUT = 1000 * 60 * 30;
const SESSION_END_TIMEOUT = SESSION_TIMEOUT + 1000;

function parseSearchParams(
  params: URLSearchParams
): Record<string, string> | undefined {
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return Object.keys(result).length ? result : undefined;
}

function parsePath(path?: string): {
  query?: Record<string, string>;
  path: string;
  hash?: string;
} {
  if (!path) {
    return {
      path: '',
    };
  }

  try {
    const url = new URL(path);
    return {
      query: parseSearchParams(url.searchParams),
      path: url.pathname,
      hash: url.hash || undefined,
    };
  } catch (error) {
    return {
      path,
    };
  }
}

function isSameDomain(url1: string | undefined, url2: string | undefined) {
  if (!url1 || !url2) {
    return false;
  }
  try {
    return new URL(url1).hostname === new URL(url2).hostname;
  } catch (e) {
    return false;
  }
}

export async function postEvent(
  request: FastifyRequest<{
    Body: PostEventPayload;
  }>,
  reply: FastifyReply
) {
  let deviceId: string | null = null;
  const { projectId, body } = request;
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
  const profileId = body.profileId ?? '';
  const createdAt = new Date(body.timestamp);
  const url = getProperty('__path');
  const { path, hash, query } = parsePath(url);
  const referrer = isSameDomain(getProperty('__referrer'), url)
    ? null
    : parseReferrer(getProperty('__referrer'));
  const utmReferrer = getReferrerWithQuery(query);
  const ip = getClientIp(request)!;
  const origin = request.headers.origin!;
  const ua = request.headers['user-agent']!;
  const uaInfo = parseUserAgent(ua);
  const salts = await getSalts();
  const currentDeviceId = generateDeviceId({
    salt: salts.current,
    origin,
    ip,
    ua,
  });
  const previousDeviceId = generateDeviceId({
    salt: salts.previous,
    origin,
    ip,
    ua,
  });

  const isServerEvent = !ip && !origin && !isUserAgentSet(ua);

  if (isServerEvent) {
    const [event] = await getEvents(
      `SELECT * FROM events WHERE name = 'screen_view' AND profile_id = '${profileId}' AND project_id = '${projectId}' ORDER BY created_at DESC LIMIT 1`
    );

    eventsQueue.add('event', {
      type: 'createEvent',
      payload: {
        name: body.name,
        deviceId: event?.deviceId || '',
        sessionId: event?.sessionId || '',
        profileId,
        projectId,
        properties: Object.assign(
          {},
          omit(['__path', '__referrer'], properties),
          {
            hash,
            query,
          }
        ),
        createdAt,
        country: event?.country ?? '',
        city: event?.city ?? '',
        region: event?.region ?? '',
        continent: event?.continent ?? '',
        os: event?.os ?? '',
        osVersion: event?.osVersion ?? '',
        browser: event?.browser ?? '',
        browserVersion: event?.browserVersion ?? '',
        device: event?.device ?? '',
        brand: event?.brand ?? '',
        model: event?.model ?? '',
        duration: 0,
        path: event?.path ?? '',
        referrer: event?.referrer ?? '',
        referrerName: event?.referrerName ?? '',
        referrerType: event?.referrerType ?? '',
        profile: undefined,
        meta: undefined,
      },
    });
    return reply.status(200).send('');
  }

  const [geo, eventsJobs] = await Promise.all([
    parseIp(ip),
    eventsQueue.getJobs(['delayed']),
  ]);

  // find session_end job
  const sessionEndJobCurrentDeviceId = findJobByPrefix(
    eventsJobs,
    `sessionEnd:${projectId}:${currentDeviceId}:`
  );
  const sessionEndJobPreviousDeviceId = findJobByPrefix(
    eventsJobs,
    `sessionEnd:${projectId}:${previousDeviceId}:`
  );

  const createSessionStart =
    !sessionEndJobCurrentDeviceId && !sessionEndJobPreviousDeviceId;

  if (sessionEndJobCurrentDeviceId && !sessionEndJobPreviousDeviceId) {
    request.log.info({}, 'found session current');
    deviceId = currentDeviceId;
    const diff = Date.now() - sessionEndJobCurrentDeviceId.timestamp;
    sessionEndJobCurrentDeviceId.changeDelay(diff + SESSION_END_TIMEOUT);
  } else if (!sessionEndJobCurrentDeviceId && sessionEndJobPreviousDeviceId) {
    request.log.info({}, 'found session previous');
    deviceId = previousDeviceId;
    const diff = Date.now() - sessionEndJobPreviousDeviceId.timestamp;
    sessionEndJobPreviousDeviceId.changeDelay(diff + SESSION_END_TIMEOUT);
  } else {
    request.log.info({}, 'new session with current');
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

  const [sessionStartEvent] = await getEvents(
    `SELECT * FROM events WHERE name = 'session_start' AND device_id = '${deviceId}' AND project_id = '${projectId}' ORDER BY created_at DESC LIMIT 1`
  );

  request.log.info(
    {
      ip,
      origin,
      ua,
      uaInfo,
      referrer,
      profileId,
      projectId,
      deviceId,
      geo,
      sessionStartEvent,
      path,
    },
    'incoming event'
  );

  const payload: Omit<IServiceCreateEventPayload, 'id'> = {
    name: body.name,
    deviceId,
    profileId,
    projectId,
    sessionId: createSessionStart ? uuid() : sessionStartEvent?.sessionId ?? '',
    properties: Object.assign({}, omit(['__path', '__referrer'], properties), {
      hash,
      query,
    }),
    createdAt,
    country: geo.country,
    city: geo.city,
    region: geo.region,
    continent: geo.continent,
    os: uaInfo.os,
    osVersion: uaInfo.osVersion,
    browser: uaInfo.browser,
    browserVersion: uaInfo.browserVersion,
    device: uaInfo.device,
    brand: uaInfo.brand,
    model: uaInfo.model,
    duration: 0,
    path: path,
    referrer: referrer?.url,
    referrerName: referrer?.name ?? utmReferrer?.name ?? '',
    referrerType: referrer?.type ?? utmReferrer?.type ?? '',
    profile: undefined,
    meta: undefined,
  };

  const job = findJobByPrefix(eventsJobs, `event:${projectId}:${deviceId}:`);

  if (job?.isDelayed && job.data.type === 'createEvent') {
    const prevEvent = job.data.payload;
    const duration = getTime(payload.createdAt) - getTime(prevEvent.createdAt);

    // Set path from prev screen_view event if current event is not a screen_view
    if (payload.name != 'screen_view') {
      payload.path = prevEvent.path;
    }

    if (payload.name === 'screen_view') {
      if (duration < 0) {
        request.log.info(
          {
            prevEvent,
            payload,
          },
          'duration is wrong'
        );
      }
      await job.updateData({
        type: 'createEvent',
        payload: {
          ...prevEvent,
          duration,
        },
      });
      await job.promote();
    }
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

  request.log.info(payload, 'queue event');
  // Queue current event
  eventsQueue.add(
    'event',
    {
      type: 'createEvent',
      payload,
    },
    options
  );

  reply.status(202).send(deviceId);
}

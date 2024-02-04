import { parseIp } from '@/utils/parseIp';
import { parseUserAgent } from '@/utils/parseUserAgent';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getClientIp } from 'request-ip';

import { generateProfileId, getTime, toISOString } from '@mixan/common';
import type { IServiceCreateEventPayload } from '@mixan/db';
import { getSalts } from '@mixan/db';
import type { JobsOptions } from '@mixan/queue';
import { eventsQueue, findJobByPrefix } from '@mixan/queue';

export interface PostEventPayload {
  profileId?: string;
  name: string;
  timestamp: string;
  properties: Record<string, unknown>;
  referrer: string | undefined;
  path: string;
}

const SESSION_TIMEOUT = 1000 * 30 * 1;
const SESSION_END_TIMEOUT = SESSION_TIMEOUT + 1000;

export async function postEvent(
  request: FastifyRequest<{
    Body: PostEventPayload;
  }>,
  reply: FastifyReply
) {
  let profileId: string | null = null;
  const projectId = request.projectId;
  const body = request.body;
  const path = body.path;
  const ip = getClientIp(request)!;
  const origin = request.headers.origin!;
  const ua = request.headers['user-agent']!;
  const uaInfo = parseUserAgent(ua);
  const salts = await getSalts();

  const [currentProfileId, previousProfileId, geo, eventsJobs] =
    await Promise.all([
      generateProfileId({
        salt: salts.current,
        origin,
        ip,
        ua,
      }),
      generateProfileId({
        salt: salts.previous,
        origin,
        ip,
        ua,
      }),
      parseIp(ip),
      eventsQueue.getJobs(['delayed']),
    ]);

  // find session_end job
  const sessionEndJobCurrentProfileId = findJobByPrefix(
    eventsJobs,
    `sessionEnd:${projectId}:${currentProfileId}:`
  );
  const sessionEndJobPreviousProfileId = findJobByPrefix(
    eventsJobs,
    `sessionEnd:${projectId}:${previousProfileId}:`
  );

  const createSessionStart =
    !sessionEndJobCurrentProfileId && !sessionEndJobPreviousProfileId;

  if (sessionEndJobCurrentProfileId && !sessionEndJobPreviousProfileId) {
    console.log('found session current');
    profileId = currentProfileId;
    const diff = Date.now() - sessionEndJobCurrentProfileId.timestamp;
    sessionEndJobCurrentProfileId.changeDelay(diff + SESSION_END_TIMEOUT);
  } else if (!sessionEndJobCurrentProfileId && sessionEndJobPreviousProfileId) {
    console.log('found session previous');
    profileId = previousProfileId;
    const diff = Date.now() - sessionEndJobPreviousProfileId.timestamp;
    sessionEndJobPreviousProfileId.changeDelay(diff + SESSION_END_TIMEOUT);
  } else {
    console.log('new session with current');
    profileId = currentProfileId;
    // Queue session end
    eventsQueue.add(
      'event',
      {
        type: 'createSessionEnd',
        payload: {
          profileId,
        },
      },
      {
        delay: SESSION_END_TIMEOUT,
        jobId: `sessionEnd:${projectId}:${profileId}:${Date.now()}`,
      }
    );
  }

  const payload: IServiceCreateEventPayload = {
    name: body.name,
    profileId,
    projectId,
    properties: body.properties,
    createdAt: body.timestamp,
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
    path,
    referrer: body.referrer, // TODO
    referrerName: body.referrer, // TODO
  };

  console.log(payload);

  const job = findJobByPrefix(eventsJobs, `event:${projectId}:${profileId}:`);

  if (job?.isDelayed && job.data.type === 'createEvent') {
    const prevEvent = job.data.payload;
    const duration = getTime(payload.createdAt) - getTime(prevEvent.createdAt);

    // Set path from prev screen_view event if current event is not a screen_view
    if (payload.name != 'screen_view') {
      payload.path = prevEvent.path;
    }

    if (payload.name === 'screen_view') {
      await job.updateData({
        type: 'createEvent',
        payload: {
          ...prevEvent,
          duration,
        },
      });
      job.promote();
    }
  }

  if (createSessionStart) {
    eventsQueue.add('event', {
      type: 'createEvent',
      payload: {
        ...payload,
        name: 'session_start',
        createdAt: toISOString(getTime(payload.createdAt) - 10),
      },
    });
  }

  const options: JobsOptions = {};
  if (payload.name === 'screen_view') {
    options.delay = SESSION_TIMEOUT;
    options.jobId = `event:${projectId}:${profileId}:${Date.now()}`;
  }

  // Queue current event
  eventsQueue.add(
    'event',
    {
      type: 'createEvent',
      payload,
    },
    options
  );

  reply.status(202).send(profileId);
}

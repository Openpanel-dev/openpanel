import { getClientIp, parseIp } from '@/utils/parseIp';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { generateDeviceId } from '@openpanel/common/server';
import { getSalts } from '@openpanel/db';
import { eventsQueue } from '@openpanel/queue';
import { getRedisCache } from '@openpanel/redis';
import type { PostEventPayload } from '@openpanel/sdk';

import { getStringHeaders } from './track.controller';

export async function postEvent(
  request: FastifyRequest<{
    Body: PostEventPayload;
  }>,
  reply: FastifyReply,
) {
  const ip = getClientIp(request)!;
  const ua = request.headers['user-agent']!;
  const projectId = request.client?.projectId;

  if (!projectId) {
    reply.status(400).send('missing origin');
    return;
  }

  const [salts, geo] = await Promise.all([getSalts(), parseIp(ip)]);
  const currentDeviceId = generateDeviceId({
    salt: salts.current,
    origin: projectId,
    ip,
    ua,
  });
  const previousDeviceId = generateDeviceId({
    salt: salts.previous,
    origin: projectId,
    ip,
    ua,
  });

  const isScreenView = request.body.name === 'screen_view';
  // this will ensure that we don't have multiple events creating sessions
  const locked = await getRedisCache().set(
    `request:priority:${currentDeviceId}-${previousDeviceId}:${isScreenView ? 'screen_view' : 'other'}`,
    'locked',
    'PX',
    950, // a bit under the delay below
    'NX',
  );

  eventsQueue.add(
    'event',
    {
      type: 'incomingEvent',
      payload: {
        projectId: request.projectId,
        headers: getStringHeaders(request.headers),
        event: {
          ...request.body,
          // Dont rely on the client for the timestamp
          timestamp: request.timestamp
            ? new Date(request.timestamp).toISOString()
            : new Date().toISOString(),
        },
        geo,
        currentDeviceId,
        previousDeviceId,
        priority: locked === 'OK',
      },
    },
    {
      // Prioritize 'screen_view' events by setting no delay
      // This ensures that session starts are created from 'screen_view' events
      // rather than other events, maintaining accurate session tracking
      delay: request.body.name === 'screen_view' ? undefined : 1000,
    },
  );

  reply.status(202).send('ok');
}

import { getClientIp, parseIp } from '@/utils/parseIp';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { generateDeviceId } from '@openpanel/common';
import { getSalts } from '@openpanel/db';
import { eventsQueue } from '@openpanel/queue';
import { getRedisCache } from '@openpanel/redis';
import type { PostEventPayload } from '@openpanel/sdk';

import { getStringHeaders } from './track.controller';

export async function postEvent(
  request: FastifyRequest<{
    Body: PostEventPayload;
  }>,
  reply: FastifyReply
) {
  const clientIp = getClientIp(request)!;
  const ip = request.headers['x-client-ip'];
  console.log({
    clientIp,
    ['X-Forwarded-For']: request.headers['X-Forwarded-For'],
    ['x-real-ip']: request.headers['x-real-ip'],
    ['x-client-ip']: request.headers['x-client-ip'],
    ['CF-Connecting-IP']: request.headers['CF-Connecting-IP'],
    Forwarded: request.headers.Forwarded,
  });

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

  // this will ensure that we don't have multiple events creating sessions
  const locked = await getRedisCache().set(
    `request:priority:${currentDeviceId}-${previousDeviceId}`,
    'locked',
    'EX',
    10,
    'NX'
  );

  eventsQueue.add('event', {
    type: 'incomingEvent',
    payload: {
      projectId: request.projectId,
      headers: getStringHeaders(request.headers),
      event: {
        ...request.body,
        // Dont rely on the client for the timestamp
        timestamp: new Date().toISOString(),
      },
      geo,
      currentDeviceId,
      previousDeviceId,
      priority: locked === 'OK',
    },
  });

  reply.status(202).send('ok');
}

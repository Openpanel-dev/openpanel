import { getClientIp } from '@/utils/get-client-ip';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { generateDeviceId } from '@openpanel/common/server';
import { getSalts } from '@openpanel/db';
import { eventsQueue } from '@openpanel/queue';
import { getLock } from '@openpanel/redis';
import type { PostEventPayload } from '@openpanel/sdk';

import { checkDuplicatedEvent } from '@/utils/deduplicate';
import { getGeoLocation } from '@openpanel/geo';
import { getStringHeaders, getTimestamp } from './track.controller';

export async function postEvent(
  request: FastifyRequest<{
    Body: PostEventPayload;
  }>,
  reply: FastifyReply,
) {
  const timestamp = getTimestamp(request.timestamp, request.body);
  const ip = getClientIp(request)!;
  const ua = request.headers['user-agent']!;
  const projectId = request.client?.projectId;

  if (!projectId) {
    reply.status(400).send('missing origin');
    return;
  }

  const [salts, geo] = await Promise.all([getSalts(), getGeoLocation(ip)]);
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

  if (
    await checkDuplicatedEvent({
      reply,
      payload: {
        ...request.body,
        timestamp,
        previousDeviceId,
        currentDeviceId,
      },
      projectId,
    })
  ) {
    return;
  }

  await eventsQueue.add(
    'event',
    {
      type: 'incomingEvent',
      payload: {
        projectId,
        headers: getStringHeaders(request.headers),
        event: {
          ...request.body,
          timestamp: timestamp.timestamp,
          isTimestampFromThePast: timestamp.isTimestampFromThePast,
        },
        geo,
        currentDeviceId,
        previousDeviceId,
      },
    },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 200,
      },
    },
  );

  reply.status(202).send('ok');
}

import { getClientIp, parseIp } from '@/utils/parse-ip';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { generateDeviceId } from '@openpanel/common/server';
import { getSalts } from '@openpanel/db';
import { eventsQueue } from '@openpanel/queue';
import { getLock } from '@openpanel/redis';
import type { PostEventPayload } from '@openpanel/sdk';

import { checkDuplicatedEvent } from '@/utils/deduplicate';
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

  const isScreenView = request.body.name === 'screen_view';
  // this will ensure that we don't have multiple events creating sessions
  const LOCK_DURATION = 1000;
  const locked = await getLock(
    `request:priority:${currentDeviceId}-${previousDeviceId}:${isScreenView ? 'screen_view' : 'other'}`,
    'locked',
    LOCK_DURATION,
  );

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
        priority: locked,
      },
    },
    {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 200,
      },
      // Prioritize 'screen_view' events by setting no delay
      // This ensures that session starts are created from 'screen_view' events
      // rather than other events, maintaining accurate session tracking
      delay: isScreenView ? undefined : LOCK_DURATION - 100,
    },
  );

  reply.status(202).send('ok');
}

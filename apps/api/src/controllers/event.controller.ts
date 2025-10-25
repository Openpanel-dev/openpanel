import { getClientIp } from '@/utils/get-client-ip';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { generateDeviceId, parseUserAgent } from '@openpanel/common/server';
import { getSalts } from '@openpanel/db';
import { eventsGroupQueue } from '@openpanel/queue';
import type { PostEventPayload } from '@openpanel/sdk';

import { generateId } from '@openpanel/common';
import { getGeoLocation } from '@openpanel/geo';
import { getStringHeaders, getTimestamp } from './track.controller';

export async function postEvent(
  request: FastifyRequest<{
    Body: PostEventPayload;
  }>,
  reply: FastifyReply,
) {
  const { timestamp, isTimestampFromThePast } = getTimestamp(
    request.timestamp,
    request.body,
  );
  const ip = getClientIp(request)!;
  const ua = request.headers['user-agent']!;
  const projectId = request.client?.projectId;
  const headers = getStringHeaders(request.headers);

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

  const uaInfo = parseUserAgent(ua, request.body?.properties);
  const groupId = uaInfo.isServer
    ? request.body?.profileId
      ? `${projectId}:${request.body?.profileId}`
      : `${projectId}:${generateId()}`
    : currentDeviceId;
  const jobId = [
    request.body.name,
    timestamp,
    projectId,
    currentDeviceId,
    groupId,
  ]
    .filter(Boolean)
    .join('-');
  await eventsGroupQueue.add({
    orderMs: new Date(timestamp).getTime(),
    data: {
      projectId,
      headers,
      event: {
        ...request.body,
        timestamp,
        isTimestampFromThePast,
      },
      uaInfo,
      geo,
      currentDeviceId,
      previousDeviceId,
    },
    groupId,
    jobId,
  });

  reply.status(202).send('ok');
}

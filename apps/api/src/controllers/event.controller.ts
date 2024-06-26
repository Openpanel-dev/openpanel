import { getClientIp, parseIp } from '@/utils/parseIp';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { generateDeviceId } from '@openpanel/common';
import { getSalts } from '@openpanel/db';
import { eventsQueue } from '@openpanel/queue';
import type { PostEventPayload } from '@openpanel/sdk';

export async function postEvent(
  request: FastifyRequest<{
    Body: PostEventPayload;
  }>,
  reply: FastifyReply
) {
  const ip = getClientIp(request)!;
  const ua = request.headers['user-agent']!;
  const origin = request.headers.origin!;
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
  // TODO: Remove after 2024-09-26
  const currentDeviceIdDeprecated = generateDeviceId({
    salt: salts.current,
    origin,
    ip,
    ua,
  });
  const previousDeviceIdDeprecated = generateDeviceId({
    salt: salts.previous,
    origin,
    ip,
    ua,
  });

  eventsQueue.add('event', {
    type: 'incomingEvent',
    payload: {
      projectId: request.projectId,
      headers: {
        ua,
      },
      event: request.body,
      geo,
      currentDeviceId,
      previousDeviceId,
      // TODO: Remove after 2024-09-26
      currentDeviceIdDeprecated,
      previousDeviceIdDeprecated,
    },
  });

  reply.status(202).send('ok');
}

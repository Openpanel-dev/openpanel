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
  const salts = await getSalts();
  const currentDeviceId = generateDeviceId({
    salt: salts.current,
    origin: origin,
    ip,
    ua,
  });
  const previousDeviceId = generateDeviceId({
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
        origin,
        ua,
      },
      event: request.body,
      geo: await parseIp(ip),
      currentDeviceId,
      previousDeviceId,
    },
  });

  reply.status(202).send('ok');
}

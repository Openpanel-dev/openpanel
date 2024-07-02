import { logger } from '@/utils/logger';
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
  if (process.env.TEST_SELF_HOSTING) {
    try {
      const ip = getClientIp(request)!;
      const headers: HeadersInit = {
        origin: request.headers.origin!,
        'user-agent': request.headers['user-agent']!,
        'Content-Type': 'application/json',
      };

      if (ip) {
        headers['X-Forwarded-For'] = ip;
        headers['x-real-ip'] = ip;
        headers['x-client-ip'] = ip;
        headers['CF-Connecting-IP'] = ip;
        headers.Forwarded = 'for=' + ip;
      }

      if (request.headers['mixan-client-id']) {
        headers['openpanel-client-id'] = request.headers[
          'mixan-client-id'
        ] as string;
        if (request.headers['mixan-client-secret']) {
          headers['openpanel-client-secret'] = request.headers[
            'mixan-client-secret'
          ] as string;
        }
      } else if (request.headers['openpanel-client-id']) {
        headers['openpanel-client-id'] = request.headers[
          'openpanel-client-id'
        ] as string;
        if (request.headers['openpanel-client-secret']) {
          headers['openpanel-client-secret'] = request.headers[
            'openpanel-client-secret'
          ] as string;
        }
      }
      // Test batching on a different service
      await fetch('https://op.coderax.se/api/event', {
        headers,
        method: 'POST',
        body: JSON.stringify(request.body),
      })
        .then((res) => res.json())
        .catch((res) => res);
    } catch (e) {
      logger.error(e);
    }
  }
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

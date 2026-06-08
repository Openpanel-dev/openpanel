import type { FastifyRequest } from 'fastify';
import superjson from 'superjson';

import type { WebSocket } from '@fastify/websocket';
import {
  eventBuffer,
  getProfileById,
  transformMinimalEvent,
} from '@openpanel/db';
import { setSuperJson } from '@openpanel/json';
import { subscribeToPublishedEvent } from '@openpanel/redis';
import { getProjectAccess } from '@openpanel/trpc';
import { getOrganizationAccess } from '@openpanel/trpc/src/access';

/**
 * Per-socket cap on undrained outbound bytes. Above this the client is
 * considered too slow to consume the firehose, and we drop the message
 * instead of buffering it indefinitely.
 *
 * Live data is fire-and-forget — dropping is safe. The alternative
 * (queueing forever) is what caused the heap leak: in heap snapshots we
 * saw ~105 sockets each holding 100-200 MB of pending WebSocket frames,
 * each with the serialized event + profile payload. Heaviest pods had
 * 200K+ {chunk, encoding, callback} entries retaining 200+ MB and
 * 105 WritableStates retaining ~214 MB each.
 */
const MAX_WS_BUFFERED_BYTES = 1_000_000;

function shouldSkipSend(socket: WebSocket): boolean {
  if (socket.readyState !== socket.OPEN) {
    return true;
  }
  if (socket.bufferedAmount > MAX_WS_BUFFERED_BYTES) {
    return true;
  }
  return false;
}

export function wsVisitors(
  socket: WebSocket,
  req: FastifyRequest<{
    Params: {
      projectId: string;
    };
  }>,
) {
  const { params } = req;
  const unsubscribe = subscribeToPublishedEvent('events', 'saved', (event) => {
    if (event?.projectId === params.projectId) {
      if (shouldSkipSend(socket)) return;
      eventBuffer.getActiveVisitorCount(params.projectId).then((count) => {
        if (shouldSkipSend(socket)) return;
        socket.send(String(count));
      });
    }
  });

  socket.on('close', () => {
    unsubscribe();
  });
}

export async function wsProjectEvents(
  socket: WebSocket,
  req: FastifyRequest<{
    Params: {
      projectId: string;
    };
    Querystring: {
      token?: string;
      type?: 'saved' | 'received';
    };
  }>,
) {
  const { params, query } = req;
  const type = query.type || 'saved';

  if (!['saved', 'received'].includes(type)) {
    socket.send('Invalid type');
    socket.close();
    return;
  }

  const userId = req.session?.userId;
  if (!userId) {
    socket.send('No active session');
    socket.close();
    return;
  }

  const access = await getProjectAccess({
    userId,
    projectId: params.projectId,
  });

  const unsubscribe = subscribeToPublishedEvent(
    'events',
    type,
    async (event) => {
      if (event.projectId !== params.projectId) return;
      // Drop the message if the client is falling behind. Without this the
      // per-socket WritableState grows unbounded for slow/backgrounded tabs
      // and the API pod heap fills up. Dropping live events is safe — the
      // dashboard is for live tail, not durable delivery.
      if (shouldSkipSend(socket)) return;
      const profile = await getProfileById(event.profileId, event.projectId);
      if (shouldSkipSend(socket)) return;
      socket.send(
        superjson.stringify(
          access
            ? {
                ...event,
                profile,
              }
            : transformMinimalEvent(event),
        ),
      );
    },
  );

  socket.on('close', () => unsubscribe());
}

export async function wsProjectNotifications(
  socket: WebSocket,
  req: FastifyRequest<{
    Params: {
      projectId: string;
    };
  }>,
) {
  const { params } = req;
  const userId = req.session?.userId;

  if (!userId) {
    socket.send('No active session');
    socket.close();
    return;
  }

  const access = await getProjectAccess({
    userId,
    projectId: params.projectId,
  });

  if (!access) {
    socket.send('No access');
    socket.close();
    return;
  }

  const unsubscribe = subscribeToPublishedEvent(
    'notification',
    'created',
    (notification) => {
      if (notification.projectId !== params.projectId) return;
      if (shouldSkipSend(socket)) return;
      socket.send(superjson.stringify(notification));
    },
  );

  socket.on('close', () => unsubscribe());
}

export async function wsOrganizationEvents(
  socket: WebSocket,
  req: FastifyRequest<{
    Params: {
      organizationId: string;
    };
  }>,
) {
  const { params } = req;
  const userId = req.session?.userId;

  if (!userId) {
    socket.send('No active session');
    socket.close();
    return;
  }

  const access = await getOrganizationAccess({
    userId,
    organizationId: params.organizationId,
  });

  if (!access) {
    socket.send('No access');
    socket.close();
    return;
  }

  const unsubscribe = subscribeToPublishedEvent(
    'organization',
    'subscription_updated',
    (message) => {
      if (shouldSkipSend(socket)) return;
      socket.send(setSuperJson(message));
    },
  );

  socket.on('close', () => unsubscribe());
}

import type { FastifyRequest } from 'fastify';
import superjson from 'superjson';

import type { WebSocket } from '@fastify/websocket';
import {
  eventBuffer,
  getProfileByIdCached,
  transformMinimalEvent,
} from '@openpanel/db';
import { setSuperJson } from '@openpanel/json';
import {
  psubscribeToPublishedEvent,
  subscribeToPublishedEvent,
} from '@openpanel/redis';
import { getProjectAccess } from '@openpanel/trpc';
import { getOrganizationAccess } from '@openpanel/trpc/src/access';

export function getLiveEventInfo(key: string) {
  return key.split(':').slice(2) as [string, string];
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
      eventBuffer.getActiveVisitorCount(params.projectId).then((count) => {
        socket.send(String(count));
      });
    }
  });

  const punsubscribe = psubscribeToPublishedEvent(
    '__keyevent@0__:expired',
    (key) => {
      const [projectId] = getLiveEventInfo(key);
      if (projectId && projectId === params.projectId) {
        eventBuffer.getActiveVisitorCount(params.projectId).then((count) => {
          socket.send(String(count));
        });
      }
    },
  );

  socket.on('close', () => {
    unsubscribe();
    punsubscribe();
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
      if (event.projectId === params.projectId) {
        const profile = await getProfileByIdCached(
          event.profileId,
          event.projectId,
        );
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
      }
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
      if (notification.projectId === params.projectId) {
        socket.send(superjson.stringify(notification));
      }
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
      socket.send(setSuperJson(message));
    },
  );

  socket.on('close', () => unsubscribe());
}

import type { FastifyRequest } from 'fastify';
import superjson from 'superjson';
import type * as WebSocket from 'ws';

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
  connection: {
    socket: WebSocket;
  },
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
        connection.socket.send(String(count));
      });
    }
  });

  const punsubscribe = psubscribeToPublishedEvent(
    '__keyevent@0__:expired',
    (key) => {
      const [projectId] = getLiveEventInfo(key);
      if (projectId && projectId === params.projectId) {
        eventBuffer.getActiveVisitorCount(params.projectId).then((count) => {
          connection.socket.send(String(count));
        });
      }
    },
  );

  connection.socket.on('close', () => {
    unsubscribe();
    punsubscribe();
  });
}

export async function wsProjectEvents(
  connection: {
    socket: WebSocket;
  },
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
    connection.socket.send('Invalid type');
    connection.socket.close();
    return;
  }

  const userId = req.session?.userId;
  if (!userId) {
    connection.socket.send('No active session');
    connection.socket.close();
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
        connection.socket.send(
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

  connection.socket.on('close', () => unsubscribe());
}

export async function wsProjectNotifications(
  connection: {
    socket: WebSocket;
  },
  req: FastifyRequest<{
    Params: {
      projectId: string;
    };
  }>,
) {
  const { params } = req;
  const userId = req.session?.userId;

  if (!userId) {
    connection.socket.send('No active session');
    connection.socket.close();
    return;
  }

  const access = await getProjectAccess({
    userId,
    projectId: params.projectId,
  });

  if (!access) {
    connection.socket.send('No access');
    connection.socket.close();
    return;
  }

  const unsubscribe = subscribeToPublishedEvent(
    'notification',
    'created',
    (notification) => {
      if (notification.projectId === params.projectId) {
        connection.socket.send(superjson.stringify(notification));
      }
    },
  );

  connection.socket.on('close', () => unsubscribe());
}

export async function wsOrganizationEvents(
  connection: {
    socket: WebSocket;
  },
  req: FastifyRequest<{
    Params: {
      organizationId: string;
    };
  }>,
) {
  const { params } = req;
  const userId = req.session?.userId;

  if (!userId) {
    connection.socket.send('No active session');
    connection.socket.close();
    return;
  }

  const access = await getOrganizationAccess({
    userId,
    organizationId: params.organizationId,
  });

  if (!access) {
    connection.socket.send('No access');
    connection.socket.close();
    return;
  }

  const unsubscribe = subscribeToPublishedEvent(
    'organization',
    'subscription_updated',
    (message) => {
      connection.socket.send(setSuperJson(message));
    },
  );

  connection.socket.on('close', () => unsubscribe());
}

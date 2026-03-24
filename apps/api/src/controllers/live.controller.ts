import type { WebSocket } from '@fastify/websocket';
import { eventBuffer } from '@openpanel/db';
import { setSuperJson } from '@openpanel/json';
import { subscribeToPublishedEvent } from '@openpanel/redis';
import { getProjectAccess } from '@openpanel/trpc';
import { getOrganizationAccess } from '@openpanel/trpc/src/access';
import type { FastifyRequest } from 'fastify';

export function wsVisitors(
  socket: WebSocket,
  req: FastifyRequest<{
    Params: {
      projectId: string;
    };
  }>
) {
  const { params } = req;
  const sendCount = () => {
    eventBuffer
      .getActiveVisitorCount(params.projectId)
      .then((count) => {
        socket.send(String(count));
      })
      .catch(() => {
        socket.send('0');
      });
  };

  const unsubscribe = subscribeToPublishedEvent(
    'events',
    'batch',
    ({ projectId }) => {
      if (projectId === params.projectId) {
        sendCount();
      }
    }
  );

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
    };
  }>
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
    'events',
    'batch',
    ({ projectId, count }) => {
      if (projectId === params.projectId) {
        socket.send(setSuperJson({ count }));
      }
    }
  );

  socket.on('close', () => unsubscribe());
}

export async function wsProjectNotifications(
  socket: WebSocket,
  req: FastifyRequest<{
    Params: {
      projectId: string;
    };
  }>
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
        socket.send(setSuperJson(notification));
      }
    }
  );

  socket.on('close', () => unsubscribe());
}

export async function wsOrganizationEvents(
  socket: WebSocket,
  req: FastifyRequest<{
    Params: {
      organizationId: string;
    };
  }>
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
    }
  );

  socket.on('close', () => unsubscribe());
}

// The `/live` websocket surface. `/live/visitors/:projectId` stays
// unauthenticated by intent; the other three require a session plus
// project/org access. All four use REJECT-AFTER-UPGRADE: the socket accepts
// the upgrade, then the open handler sends a text frame and closes it. None
// of these routes uses the `session` macro, because that macro would 401 the
// HTTP upgrade request itself instead of letting the socket reject after
// connecting.

import { setSuperJson } from '@openpanel/shared';
import { z } from 'zod';
import { defineRoutes } from '../../http/define';
import {
  getActiveVisitorCount,
  subscribeToOrganizationSubscriptionUpdates,
  subscribeToProjectEventBatches,
  subscribeToProjectNotifications,
  subscribeToVisitorActivity,
} from './realtime.service';

const NO_ACTIVE_SESSION_MESSAGE = 'No active session';
const NO_ACCESS_MESSAGE = 'No access';

const projectParams = z.object({ projectId: z.string() });
const organizationParams = z.object({ organizationId: z.string() });

interface ClosableSocket {
  send(data: string): unknown;
  close(): unknown;
  raw: object;
}

// Per-connection cleanup, keyed by the underlying native socket: `ws.raw` is
// the same reference for open/message/close on one connection, unlike `ws`
// itself (a fresh `ElysiaWS` wrapper per callback invocation).
const unsubscribeBySocket = new WeakMap<object, () => void>();

function rememberUnsubscribe(ws: ClosableSocket, unsubscribe: () => void) {
  unsubscribeBySocket.set(ws.raw, unsubscribe);
}

function forgetUnsubscribe(ws: ClosableSocket) {
  unsubscribeBySocket.get(ws.raw)?.();
  unsubscribeBySocket.delete(ws.raw);
}

function rejectNoSession(ws: ClosableSocket) {
  ws.send(NO_ACTIVE_SESSION_MESSAGE);
  ws.close();
}

function rejectNoAccess(ws: ClosableSocket) {
  ws.send(NO_ACCESS_MESSAGE);
  ws.close();
}

export const realtimeRoutes = defineRoutes((app) =>
  app
    .ws('/live/visitors/:projectId', {
      params: projectParams,
      async open(ws) {
        const { projectId } = ws.data.params;
        const { ctx } = ws.data;
        rememberUnsubscribe(
          ws,
          await subscribeToVisitorActivity(projectId, () => {
            getActiveVisitorCount(ctx, projectId).then(
              (count) => ws.send(String(count)),
              () => ws.send('0')
            );
          })
        );
      },
      close(ws) {
        forgetUnsubscribe(ws);
      },
    })
    .ws('/live/events/:projectId', {
      params: projectParams,
      async open(ws) {
        const { projectId } = ws.data.params;
        const userId = (await ws.data.ctx.session())?.userId;
        if (!userId) {
          rejectNoSession(ws);
          return;
        }

        const access = await ws.data.ctx.services.auth.getProjectAccess({
          userId,
          projectId,
        });
        if (!access) {
          rejectNoAccess(ws);
          return;
        }

        rememberUnsubscribe(
          ws,
          await subscribeToProjectEventBatches(projectId, (event) => {
            ws.send(setSuperJson({ count: event.count }));
          })
        );
      },
      close(ws) {
        forgetUnsubscribe(ws);
      },
    })
    .ws('/live/notifications/:projectId', {
      params: projectParams,
      async open(ws) {
        const { projectId } = ws.data.params;
        const userId = (await ws.data.ctx.session())?.userId;
        if (!userId) {
          rejectNoSession(ws);
          return;
        }

        const access = await ws.data.ctx.services.auth.getProjectAccess({
          userId,
          projectId,
        });
        if (!access) {
          rejectNoAccess(ws);
          return;
        }

        rememberUnsubscribe(
          ws,
          await subscribeToProjectNotifications(projectId, (notification) => {
            ws.send(setSuperJson(notification));
          })
        );
      },
      close(ws) {
        forgetUnsubscribe(ws);
      },
    })
    .ws('/live/organization/:organizationId', {
      params: organizationParams,
      async open(ws) {
        const { organizationId } = ws.data.params;
        const userId = (await ws.data.ctx.session())?.userId;
        if (!userId) {
          rejectNoSession(ws);
          return;
        }

        const access = await ws.data.ctx.services.auth.getOrganizationAccess({
          userId,
          organizationId,
        });
        if (!access) {
          rejectNoAccess(ws);
          return;
        }

        rememberUnsubscribe(
          ws,
          // `organizationId` only reaches the subscription once
          // `getOrganizationAccess` has proved this caller is a member of it,
          // so the scope is the caller's own membership, not their input.
          await subscribeToOrganizationSubscriptionUpdates(
            organizationId,
            (message) => {
              ws.send(setSuperJson(message));
            }
          )
        );
      },
      close(ws) {
        forgetUnsubscribe(ws);
      },
    })
);

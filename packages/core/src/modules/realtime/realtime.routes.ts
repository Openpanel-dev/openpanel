// The `/live` websocket surface (M6-007), Elysia/Bun-native. Ported FRESH
// from apps/api/src/controllers/live.controller.ts's business logic, NOT
// delegated: V1's Fastify controller uses `@fastify/websocket`'s `WebSocket`
// (the `ws` package, Node EventEmitter semantics), which shares nothing with
// Elysia's `ElysiaWS`/Bun's native `ServerWebSocket` — there is no shim to
// delegate through, and touching the golden-harness-critical V1 ws stack for
// a few lines of framework glue is the risk this port avoids (task notes).
// V1's controller and router are LEFT UNTOUCHED. The shared logic —
// `getActiveVisitorCount`, the four `subscribeToPublishedEvent` calls — moved
// to realtime.service.ts's "/live websocket glue" section; both stacks call
// the exact same Redis subscription underneath.
//
// http/auth.ts's invariant 10 (binding, ADR-011): `/live/visitors/:projectId`
// stays unauthenticated; the other three keep session + access; all four
// keep REJECT-AFTER-UPGRADE — the socket accepts the upgrade, then the open
// handler sends a text frame and closes it, exactly like V1. This is why
// none of these routes requests the `session` macro: that macro would 401
// the HTTP upgrade request itself, which is a different (V1-divergent)
// behaviour.
//
// NAMED GAP, same as every other H module this wave: not yet reachable.
// main.ts does not mount `dashboardRoutes` until a real `AppDeps` exists
// (P3/P4/P8), and `http/session.ts`'s `resolveSession` is still a P6 stub
// that always resolves `null` — so today, the three session-gated routes
// close every connection immediately after upgrade. That is the same gap
// http/auth.test.ts already documents for every other session-macro route.

import { z } from 'zod';
import { defineRoutes } from '../../http/define';
import { setSuperJson } from '../../shared/json';
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
    // V1: wsVisitors. Unauthenticated by intent (ADR-011 invariant 10,
    // docs/ANSWERS.md §3).
    .ws('/live/visitors/:projectId', {
      params: projectParams,
      async open(ws) {
        const { projectId } = ws.data.params;
        rememberUnsubscribe(
          ws,
          await subscribeToVisitorActivity(projectId, () => {
            getActiveVisitorCount(projectId).then(
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
    // V1: wsProjectEvents.
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
    // V1: wsProjectNotifications.
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
    // V1: wsOrganizationEvents.
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
          await subscribeToOrganizationSubscriptionUpdates((message) => {
            ws.send(setSuperJson(message));
          })
        );
      },
      close(ws) {
        forgetUnsubscribe(ws);
      },
    })
);

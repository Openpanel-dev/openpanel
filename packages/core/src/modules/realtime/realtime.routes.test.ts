// The runnable ws proof this task's notes require: `app.handle()` cannot
// exercise a websocket upgrade (no real HTTP connection to upgrade), so this
// boots the actual Elysia app with `.listen()` (== `Bun.serve` under the
// hood, same as main.ts) on an ephemeral port and drives it with a real
// `WebSocket` client — the same shape `apps/api/e2e/boot-proof.sh` uses for
// the plain-HTTP ops surface, extended to a ws handshake.
//
// The harness buffers messages/close events from the moment the socket is
// constructed: the server can send its "No active session" / "No access"
// frame and close the connection before the test ever gets to `await` a
// listener, and a listener attached after the fact misses an event that
// already fired.
//
// `./realtime.service` and `../../shared/access-lookups` (the real lookups
// auth.service.ts's `createAuthService` binds `ctx.services.auth` to,
// M10-002) are mocked (not a real Postgres/ClickHouse/Redis), and
// `../../http/session` for the same reason http/auth.test.ts mocks it:
// `resolveSession` is still a P6 stub.
//
// M12-005: every import here is STATIC. Bun 1.4.0's `mock.module` swaps an
// already-loaded module's exports in place, so a subject imported above the
// `mock.module` calls still sees them; the "not called" and "called with"
// assertions on every mock below are what would go red if that ever stopped
// holding. The deferred loads this file used to need are gone with the
// module's own (docs/TECH_DEBT.md's no-lazy-loaders ruling).

import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { getSuperJson } from '@openpanel/shared';
import { stubAppDeps } from '../../../test/http-fixtures';
import * as actualAccessLookups from '../../shared/access-lookups';
import { realtimeRoutes } from './realtime.routes';
import * as actualService from './realtime.service';

let visitorActivityCallback: (() => void) | undefined;
const unsubscribeVisitorActivity = mock(() => undefined);
const subscribeToVisitorActivity = mock(
  async (_projectId: string, onActivity: () => void) => {
    visitorActivityCallback = onActivity;
    return unsubscribeVisitorActivity;
  }
);

let eventBatchCallback: ((event: { count: number }) => void) | undefined;
const unsubscribeEventBatches = mock(() => undefined);
const subscribeToProjectEventBatches = mock(
  async (_projectId: string, onBatch: (event: { count: number }) => void) => {
    eventBatchCallback = onBatch;
    return unsubscribeEventBatches;
  }
);

const subscribeToProjectNotifications = mock(async () => () => undefined);
const subscribeToOrganizationSubscriptionUpdates = mock(
  async () => () => undefined
);

let activeVisitorCount = 0;
const getActiveVisitorCount = mock(async () => activeVisitorCount);

// Spread the real module rather than hand-listing every export:
// `mock.module` replaces this specifier process-wide (bun shares one module
// registry across files without `--isolate` — see AGENTS.md), and
// realtime.service.test.ts imports `./realtime.service` expecting the real
// implementation. A plain snapshot, not the live import binding — see
// gsc.service.test.ts's clickhouse/client mock for why the live binding would
// make a same-binding "restore" a no-op.
const realService = { ...actualService };
mock.module('./realtime.service', () => ({
  ...realService,
  getActiveVisitorCount,
  subscribeToVisitorActivity,
  subscribeToProjectEventBatches,
  subscribeToProjectNotifications,
  subscribeToOrganizationSubscriptionUpdates,
}));

afterAll(() => {
  mock.module('./realtime.service', () => realService);
});

// The real module, not `./src/access` (deleted, M10-002) — `ctx.services.auth`
// binds these same lookups in auth.service.ts, so mocking them here is what
// makes `ws.data.ctx.services.auth.getProjectAccess`/`getOrganizationAccess`
// observable from the test.
let projectAccess: { level: string } | null = null;
let organizationAccess: { role: string } | null = null;
const getProjectAccess = mock(async () => projectAccess);
const getOrganizationAccess = mock(async () => organizationAccess);
mock.module('../../shared/access-lookups', () => ({
  ...actualAccessLookups,
  getProjectAccess,
  getOrganizationAccess,
}));

let session: { userId: string } | null = null;
const resolveSession = mock(() => Promise.resolve(session));
mock.module('../../http/session', () => ({
  SESSION_COOKIE_NAME: 'session',
  resolveSession,
}));

let app: ReturnType<typeof realtimeRoutes>;
let port: number;

beforeEach(async () => {
  const { deps } = stubAppDeps();
  app = realtimeRoutes(deps);
  await new Promise<void>((resolve) => {
    app.listen(0, () => resolve());
  });
  port = app.server?.port ?? 0;

  session = null;
  projectAccess = null;
  organizationAccess = null;
  activeVisitorCount = 0;
  visitorActivityCallback = undefined;
  eventBatchCallback = undefined;
  for (const m of [
    subscribeToVisitorActivity,
    subscribeToProjectEventBatches,
    subscribeToProjectNotifications,
    subscribeToOrganizationSubscriptionUpdates,
    unsubscribeVisitorActivity,
    unsubscribeEventBatches,
    getProjectAccess,
    getOrganizationAccess,
    getActiveVisitorCount,
  ]) {
    m.mockClear();
  }
});

afterEach(async () => {
  await app.stop(true);
});

interface CloseInfo {
  code: number;
  reason: string;
}

interface WsHarness {
  ws: WebSocket;
  nextMessage(): Promise<string>;
  nextClose(): Promise<CloseInfo>;
}

/**
 * Buffers messages/close events from construction, not from whenever the
 * test happens to `await` for one — the server can send its reject frame
 * and close the socket before the test's next line runs.
 */
function connect(path: string): Promise<WsHarness> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    const messageQueue: string[] = [];
    const pendingMessage: ((value: string) => void)[] = [];
    let closeInfo: CloseInfo | undefined;
    const pendingClose: ((value: CloseInfo) => void)[] = [];

    ws.addEventListener('message', (event) => {
      const data = String(event.data);
      const next = pendingMessage.shift();
      if (next) {
        next(data);
      } else {
        messageQueue.push(data);
      }
    });

    ws.addEventListener('close', (event) => {
      closeInfo = { code: event.code, reason: event.reason };
      for (const next of pendingClose.splice(0)) {
        next(closeInfo);
      }
    });

    ws.addEventListener(
      'open',
      () => {
        resolve({
          ws,
          nextMessage: () =>
            messageQueue.length > 0
              ? Promise.resolve(messageQueue.shift() as string)
              : new Promise((res) => pendingMessage.push(res)),
          nextClose: () =>
            closeInfo
              ? Promise.resolve(closeInfo)
              : new Promise((res) => pendingClose.push(res)),
        });
      },
      { once: true }
    );
    ws.addEventListener('error', () => reject(new Error('ws error')), {
      once: true,
    });
  });
}

test('wsVisitors: no session required (ADR-011 invariant 10) — upgrades and streams the active count', async () => {
  const { ws, nextMessage } = await connect('/live/visitors/proj_1');
  activeVisitorCount = 5;

  // The subscription is registered async (behind `await subscribeTo...`);
  // give the open handler's microtask a turn before firing the callback.
  while (!visitorActivityCallback) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  visitorActivityCallback();

  await expect(nextMessage()).resolves.toBe('5');
  expect(subscribeToVisitorActivity).toHaveBeenCalledWith(
    'proj_1',
    expect.any(Function)
  );

  ws.close();
});

test('wsProjectEvents: no session -> "No active session" then close (reject-after-upgrade)', async () => {
  const { nextMessage, nextClose } = await connect('/live/events/proj_1');

  await expect(nextMessage()).resolves.toBe('No active session');
  await nextClose();
  expect(subscribeToProjectEventBatches).not.toHaveBeenCalled();
});

test('wsProjectEvents: session but no project access -> "No access" then close', async () => {
  session = { userId: 'user_1' };
  projectAccess = null;

  const { nextMessage, nextClose } = await connect('/live/events/proj_1');

  await expect(nextMessage()).resolves.toBe('No access');
  await nextClose();
  expect(getProjectAccess).toHaveBeenCalledWith({
    userId: 'user_1',
    projectId: 'proj_1',
  });
  expect(subscribeToProjectEventBatches).not.toHaveBeenCalled();
});

test('wsProjectEvents: authorized caller receives superjson-encoded batch counts', async () => {
  session = { userId: 'user_1' };
  projectAccess = { level: 'read' };

  const { ws, nextMessage } = await connect('/live/events/proj_1');

  while (!eventBatchCallback) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  eventBatchCallback({ count: 9 });

  const raw = await nextMessage();
  expect(getSuperJson<{ count: number }>(raw)).toEqual({ count: 9 });

  ws.close();
});

test('wsProjectEvents: close unsubscribes the redis subscription', async () => {
  session = { userId: 'user_1' };
  projectAccess = { level: 'read' };

  const { ws, nextClose } = await connect('/live/events/proj_1');
  while (!eventBatchCallback) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }

  ws.close();
  await nextClose();

  // The server's `close(ws)` handler (which unsubscribes) runs on receipt of
  // the client's close frame — causally before the client's own 'close'
  // fires, but not guaranteed synchronous with it; poll briefly rather than
  // assume same-tick ordering across a real socket round-trip.
  for (
    let i = 0;
    i < 50 && unsubscribeEventBatches.mock.calls.length === 0;
    i++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  expect(unsubscribeEventBatches).toHaveBeenCalledTimes(1);
});

test('wsOrganizationEvents: no session -> "No active session" then close', async () => {
  const { nextMessage, nextClose } = await connect('/live/organization/org_1');

  await expect(nextMessage()).resolves.toBe('No active session');
  await nextClose();
  expect(subscribeToOrganizationSubscriptionUpdates).not.toHaveBeenCalled();
});

test('wsOrganizationEvents: session but no org access -> "No access" then close', async () => {
  session = { userId: 'user_1' };
  organizationAccess = null;

  const { nextMessage, nextClose } = await connect('/live/organization/org_1');

  await expect(nextMessage()).resolves.toBe('No access');
  await nextClose();
  expect(getOrganizationAccess).toHaveBeenCalledWith({
    userId: 'user_1',
    organizationId: 'org_1',
  });
});

test('wsProjectNotifications: no session -> "No active session" then close', async () => {
  const { nextMessage, nextClose } = await connect(
    '/live/notifications/proj_1'
  );

  await expect(nextMessage()).resolves.toBe('No active session');
  await nextClose();
  expect(subscribeToProjectNotifications).not.toHaveBeenCalled();
});

// The /ai/agents/* mount end to end through `app.handle()`, with the global
// request-logging hook mounted the way apps/api does. That hook references
// `body`, which makes Elysia parse every POST body up front; the route must
// opt out (`parse: 'none'`) or better-agent's own `request.text()` throws
// "Body is disturbed or locked" and every chat run is a 500.

import { beforeEach, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';
import { stubAppDeps } from '../../../test/http-fixtures';
import { requestLogging } from '../../http/context';

let session: { userId: string } | null = null;
const resolveSession = mock(() => Promise.resolve(session));
mock.module('../../http/session', () => ({
  SESSION_COOKIE_NAME: 'session',
  resolveSession,
}));

const seenBodies: string[] = [];
mock.module('./assistant.service', () => ({
  createAssistantService: () => ({
    getChatApp: () => ({
      handler: async (request: Request) => {
        seenBodies.push(await request.text());
        return new Response('ok', { status: 200 });
      },
    }),
    getChatRunContext: () => ({
      run: (_context: unknown, fn: () => Promise<Response>) => fn(),
    }),
  }),
}));

const { assistantRoutes } = await import('./assistant.routes');

function buildApp() {
  const { deps } = stubAppDeps();
  return new Elysia().use(requestLogging(deps)).use(assistantRoutes(deps));
}

let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  app = buildApp();
  session = { userId: 'user_1' };
  seenBodies.length = 0;
});

function post(path: string, body: unknown) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'session=s' },
      body: JSON.stringify(body),
    })
  );
}

test('hands the chat app an unread body even with the global logging hook mounted', async () => {
  const body = { agent: '__titler', input: 'hi' };
  const response = await post('/ai/agents/__titler/run', body);
  expect(response.status).toBe(200);
  expect(seenBodies).toEqual([JSON.stringify(body)]);
});

test('a run without project context is a 400, not a body error', async () => {
  const response = await post('/ai/agents/gpt/run', { input: 'hi' });
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    message: 'Missing projectId or organizationId in context',
  });
});

test('no session -> 401', async () => {
  session = null;
  const response = await post('/ai/agents/__titler/run', { input: 'hi' });
  expect(response.status).toBe(401);
});

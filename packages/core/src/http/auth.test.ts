import { beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { Elysia } from 'elysia';
import { stubAppDeps } from '../../test/http-fixtures';
import type {
  AuthenticatedClient,
  ClientAuthOptions,
  ClientAuthResult,
} from './client-auth';

// mock.module is not hoisted, so the subject is imported inside beforeAll —
// see AGENTS.md. Both principals are stubs until P6/P8; mocking them is what
// lets the macro's two branches be exercised at all.
const CLIENT: AuthenticatedClient = {
  id: 'client-1',
  projectId: 'proj-1',
  organizationId: 'org-1',
  type: 'root',
  secretPresented: true,
};

const REFUSAL: ClientAuthResult = {
  ok: false,
  ingest: false,
  message: 'Manage: Invalid client secret',
};

let result: ClientAuthResult = { ok: true, client: CLIENT };
let session: unknown = { userId: 'user_1' };

const authenticateClient = mock(
  (_deps: unknown, _headers: Headers, _options: ClientAuthOptions) =>
    Promise.resolve(result)
);
const resolveSession = mock(() => Promise.resolve(session));

mock.module('./client-auth', () => ({ authenticateClient }));
mock.module('./session', () => ({
  SESSION_COOKIE_NAME: 'session',
  resolveSession,
}));

let authMacros: typeof import('./auth').authMacros;

beforeAll(async () => {
  ({ authMacros } = await import('./auth'));
});

beforeEach(() => {
  result = { ok: true, client: CLIENT };
  session = { userId: 'user_1' };
  authenticateClient.mockClear();
  resolveSession.mockClear();
});

function buildApp() {
  const { deps } = stubAppDeps();
  return (
    new Elysia()
      .use(authMacros(deps))
      // The principal is typed onto the handler by the macro: `client` here is
      // `AuthenticatedClient`, not `any`, and reading it off an unguarded
      // handler does not compile.
      .post(
        '/manage/projects',
        ({ client: principal }) => {
          const typed: AuthenticatedClient = principal;
          return { id: typed.id, secretPresented: typed.secretPresented };
        },
        { clientAuth: { allow: ['root'], label: 'Manage' } }
      )
      .get(
        '/dashboard',
        ({ session: principal }) => ({ ok: principal !== null }),
        {
          session: true,
        }
      )
      .get('/open', () => 'anonymous')
  );
}

test('clientAuth resolves the principal onto the handler', async () => {
  const response = await buildApp().handle(
    new Request('http://localhost/manage/projects', { method: 'POST' })
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    id: 'client-1',
    secretPresented: true,
  });
  expect(authenticateClient).toHaveBeenCalledTimes(1);
});

test('clientAuth passes the allow list through to the authenticator', async () => {
  await buildApp().handle(
    new Request('http://localhost/manage/projects', { method: 'POST' })
  );

  expect(authenticateClient.mock.calls[0]?.[2]).toEqual({
    allow: ['root'],
    label: 'Manage',
  });
});

// V1 has TWO 401 bodies and both are a wire contract: the allow-list routers
// (/export, /insights, /import, /manage) answered with a JSON envelope
// carrying the validator's own message, and the ingest routers (/track,
// /event, /profile) answered with that message as plain text.
test('clientAuth answers 401 with V1s allow-list body when nothing authenticates', async () => {
  result = REFUSAL;

  const response = await buildApp().handle(
    new Request('http://localhost/manage/projects', { method: 'POST' })
  );

  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({
    error: 'Unauthorized',
    message: 'Manage: Invalid client secret',
  });
});

test('clientAuth answers 401 with V1s ingest body, which is plain text', async () => {
  result = { ok: false, ingest: true, message: 'Missing client id' };

  const response = await buildApp().handle(
    new Request('http://localhost/manage/projects', { method: 'POST' })
  );

  expect(response.status).toBe(401);
  expect(await response.text()).toBe('Missing client id');
});

test('session resolves through the memoized HttpCtx lookup', async () => {
  const response = await buildApp().handle(
    new Request('http://localhost/dashboard')
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(resolveSession).toHaveBeenCalledTimes(1);
});

test('session answers 401 when the cookie resolves to nothing', async () => {
  session = null;

  const response = await buildApp().handle(
    new Request('http://localhost/dashboard')
  );

  expect(response.status).toBe(401);
});

// ADR-002 problem 2: a route is unauthenticated because it did not ask for a
// tier, not because of which `.use()` it was nested under.
test('a route that requests no tier authenticates nobody', async () => {
  const response = await buildApp().handle(
    new Request('http://localhost/open')
  );

  expect(response.status).toBe(200);
  expect(authenticateClient).not.toHaveBeenCalled();
  expect(resolveSession).not.toHaveBeenCalled();
});

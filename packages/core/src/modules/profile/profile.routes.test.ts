// The three /profile routes run end to end through `app.handle()`.
// `../../http/client-auth`'s `authenticateClient` is mocked so the client
// principal is deterministic, same as http/auth.test.ts does; the service
// and the geo lookup are mocked so nothing reaches a database. Every mock is
// registered before the subject's first (dynamic) import — AGENTS.md.

import { beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { stubAppDeps } from '../../../test/http-fixtures';
import type {
  AuthenticatedClient,
  ClientAuthOptions,
  ClientAuthResult,
} from '../../http/client-auth';
import { validateIngestRequest } from '../ingest/src/client-auth';
import type {
  AdjustProfilePropertyResult,
  IdentifyProfileInput,
  ProfileRequestContext,
} from './profile.service';

const CLIENT: AuthenticatedClient = {
  id: 'client-1',
  projectId: 'proj-1',
  organizationId: 'org-1',
  type: 'write',
  secretVerified: true,
};
const GEO = { country: 'SE', city: 'Stockholm' };

let clientResult: ClientAuthResult = { ok: true, client: CLIENT };
let adjustResult: AdjustProfilePropertyResult = {
  status: 'ok',
  profileId: 'prof-1',
};

const authenticateClient = mock(
  (_deps: unknown, _headers: Headers, _options: ClientAuthOptions) =>
    Promise.resolve(clientResult)
);
// Both take `ServiceDeps` first; the route hands them `ctx`.
const identifyProfile = mock(
  (
    _deps: unknown,
    _projectId: string,
    _payload: IdentifyProfileInput,
    _request: ProfileRequestContext
  ) => Promise.resolve()
);
const adjustProfileProperty = mock(
  (
    _deps: unknown,
    _projectId: string,
    _input: { profileId: string; property: string; delta: number }
  ) => Promise.resolve(adjustResult)
);
const getGeoLocation = mock((_ip?: string) => Promise.resolve(GEO));

mock.module('../../http/client-auth', () => ({ authenticateClient }));
mock.module('../../clients/geo', () => ({ getGeoLocation }));

const actualService = await import('./profile.service');
mock.module('./profile.service', () => ({
  ...actualService,
  identifyProfile,
  adjustProfileProperty,
}));

let profileRoutes: typeof import('./profile.routes').profileRoutes;

beforeAll(async () => {
  ({ profileRoutes } = await import('./profile.routes'));
});

beforeEach(() => {
  adjustResult = { status: 'ok', profileId: 'prof-1' };
  clientResult = { ok: true, client: CLIENT };
  authenticateClient.mockClear();
  identifyProfile.mockClear();
  adjustProfileProperty.mockClear();
  getGeoLocation.mockClear();
});

function post(path: string, body: unknown, userAgent = 'Mozilla/5.0 test') {
  const { deps } = stubAppDeps();
  return profileRoutes(deps).handle(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': userAgent,
      },
      body: JSON.stringify(body),
    })
  );
}

test('POST /profile identifies with geo + user agent and answers 202 + profileId', async () => {
  const payload = {
    profileId: 'prof-1',
    firstName: 'Ann',
    properties: { plan: 'pro' },
  };

  const response = await post('/profile', payload);

  expect(response.status).toBe(202);
  expect(await response.text()).toBe('prof-1');
  expect(identifyProfile).toHaveBeenCalledTimes(1);
  const [, projectId, received, context] = identifyProfile.mock.calls[0]!;
  expect(projectId).toBe('proj-1');
  expect(received).toEqual(payload);
  expect(context.geo).toEqual(GEO);
  expect(context.userAgent).toHaveProperty('browser');
  expect(getGeoLocation).toHaveBeenCalledTimes(1);
});

test('POST /profile/increment passes value through; /decrement negates it', async () => {
  const body = { profileId: 'prof-1', property: 'visits', value: 3 };

  const incremented = await post('/profile/increment', body);
  const decremented = await post('/profile/decrement', body);

  expect(incremented.status).toBe(202);
  expect(await incremented.text()).toBe('prof-1');
  expect(decremented.status).toBe(202);
  expect(adjustProfileProperty.mock.calls.map(([, ...rest]) => rest)).toEqual([
    ['proj-1', { profileId: 'prof-1', property: 'visits', delta: 3 }],
    ['proj-1', { profileId: 'prof-1', property: 'visits', delta: -3 }],
  ]);
});

test('adjust results map to V1 status codes and bodies', async () => {
  const body = { profileId: 'prof-1', property: 'visits', value: 1 };

  adjustResult = { status: 'not-found' };
  const notFound = await post('/profile/increment', body);
  expect(notFound.status).toBe(404);
  expect(await notFound.text()).toBe('Not found');

  adjustResult = { status: 'not-a-number' };
  const notNumber = await post('/profile/decrement', body);
  expect(notNumber.status).toBe(400);
  expect(await notNumber.text()).toBe('Not number');
});

test('a client without a project answers 400 before touching the service', async () => {
  clientResult = { ok: true, client: { ...CLIENT, projectId: null } };

  const response = await post('/profile', { profileId: 'prof-1' });

  expect(response.status).toBe(400);
  expect(await response.text()).toBe('No projectId');
  expect(identifyProfile).not.toHaveBeenCalled();
});

// These bodies used to reach the service and throw on `input.property.split`,
// so the caller saw a 500 with a raw TypeError (ISSUES.md H5). Elysia's schema
// refuses them instead.
//
// This suite mounts the routes alone, so it sees Elysia's own VALIDATION
// status. The assembled app maps that to 400 — see http/errors.ts, which
// documents the mapping — and the live API was verified answering
// `400 {"message":"body/property Invalid input: expected string, received
// undefined"}` for these same bodies.
const ELYSIA_VALIDATION_STATUS = 422;

test('the adjust routes reject a body that cannot name a property', async () => {
  clientResult = { ok: true, client: CLIENT };

  for (const path of ['/profile/increment', '/profile/decrement']) {
    for (const body of [
      {},
      { profileId: 'prof-1' },
      { profileId: 'prof-1', property: 'score' },
      { profileId: 'prof-1', property: '', value: 1 },
    ]) {
      const response = await post(path, body);
      expect([path, response.status]).toEqual([path, ELYSIA_VALIDATION_STATUS]);
    }
  }

  expect(adjustProfileProperty).not.toHaveBeenCalled();
});

// A negative delta is what separates this route's schema from `/track`'s
// `zIncrementPayload`, which requires a positive value.
test('increment still accepts a negative delta', async () => {
  clientResult = { ok: true, client: CLIENT };

  const response = await post('/profile/increment', {
    profileId: 'prof-1',
    property: 'score',
    value: -2,
  });

  expect(response.status).not.toBe(400);
  expect(adjustProfileProperty).toHaveBeenCalled();
});

// Each path gets a body its schema accepts, so the 401 under test is the auth
// check and not the body validation. Elysia validates the body before the
// clientAuth hook — `/track` has behaved that way since it got
// `zTrackHandlerPayload`, so an anonymous caller with a malformed body sees a
// 400 there too.
const VALID_BODY_FOR: Record<string, Record<string, unknown>> = {
  '/profile': { profileId: 'prof-1' },
  '/profile/increment': { profileId: 'prof-1', property: 'score', value: 1 },
  '/profile/decrement': { profileId: 'prof-1', property: 'score', value: 1 },
};

test('every /profile route requires client credentials', async () => {
  clientResult = { ok: false, ingest: true, message: 'Missing client id' };

  for (const [path, body] of Object.entries(VALID_BODY_FOR)) {
    const response = await post(path, body);
    expect(response.status).toBe(401);
  }
  expect(authenticateClient).toHaveBeenCalledTimes(3);
  expect(authenticateClient.mock.calls[0]?.[2]).toEqual({
    ingest: validateIngestRequest,
  });
  expect(identifyProfile).not.toHaveBeenCalled();
  expect(adjustProfileProperty).not.toHaveBeenCalled();
});

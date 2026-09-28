/**
 * Tests for validateIngestRequest — V1's `validateSdkRequest`, moved with
 * M8-002.
 *
 * The `mixan-*` case comes from
 * apps/api/src/controllers/event.controller.test.ts: ADR-015 entry 5 is pending
 * the `/event` usage metric, so the legacy header fallback stays.
 * `secretVerified` is what V1 exposed as `request.clientSecretAuth` — the side
 * channel the bot check reads — and since main #481 it is true only when the
 * secret verified.
 *
 * The `secret verification` block guards main #481: `secretVerified` and
 * revenue ingestion follow whether the secret verified against the stored hash,
 * not whether a secret string was on the request.
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = 'legacy-event-project';

const client = {
  id: CLIENT_ID,
  projectId: PROJECT_ID,
  organizationId: 'org-1',
  type: 'write',
  secret: null,
  // Keeps this test about the header fallback rather than re-proving secret
  // verification, which the auth contracts already cover.
  ignoreCorsAndSecret: true,
  project: {
    id: PROJECT_ID,
    filters: [],
    allowUnsafeRevenueTracking: false,
    cors: [],
  },
};

const getClientByIdCached = mock(async (_deps: unknown, _id: string) => client);

const verifyPassword = mock(async (_secret: string, _hash: string) => false);
const redisGet = mock(async (_key: string): Promise<string | null> => null);
const redisSetex = mock(
  async (_key: string, _ttl: number, _value: string) => 'OK'
);

const realShared = { ...(await import('@openpanel/shared/server')) };
mock.module('@openpanel/shared/server', () => ({
  ...realShared,
  verifyPassword,
}));

const realRedis = { ...(await import('@openpanel/redis')) };
mock.module('@openpanel/redis', () => ({
  ...realRedis,
  getRedisCache: () => ({ get: redisGet, setex: redisSetex }),
}));

// Client-auth.ts takes the caller's scope and reads `client.service.ts`'s
// module-scope `cacheablePerDb` — mocked at that specifier, spread-actual so
// the rest of the module (which `services.ts`'s own import of it still needs)
// stays intact.
const realClientService = { ...(await import('../../client/client.service')) };
mock.module('../../client/client.service', () => ({
  ...realClientService,
  getClientByIdCached,
}));

afterAll(() => {
  mock.module('../../client/client.service', () => realClientService);
  mock.module('@openpanel/shared/server', () => realShared);
  mock.module('@openpanel/redis', () => realRedis);
});

/** Only `db` is read on this path, and only as the cache's identity. */
const deps = { db: {} } as unknown as import('../../../services').ServiceDeps;

let validateIngestRequest: typeof import('./client-auth').validateIngestRequest;

beforeAll(async () => {
  ({ validateIngestRequest } = await import('./client-auth'));
});

beforeEach(() => {
  getClientByIdCached.mockClear();
  verifyPassword.mockReset();
  verifyPassword.mockResolvedValue(false);
  redisGet.mockReset();
  redisGet.mockResolvedValue(null);
  redisSetex.mockReset();
  redisSetex.mockResolvedValue('OK');
});

const ORIGIN = 'https://app.example.com';

/** A client that has to prove itself: no bypass, one allowed origin. */
const guardedClient = {
  ...client,
  secret: 'stored-hash' as string | null,
  ignoreCorsAndSecret: false,
  project: { ...client.project, cors: [ORIGIN] },
};

const guarded = (overrides: Partial<typeof guardedClient> = {}) => {
  getClientByIdCached.mockResolvedValueOnce({
    ...guardedClient,
    ...overrides,
  } as unknown as typeof client);
};

const body = { name: 'legacy_event', properties: { foo: 'bar' } };

describe('validateIngestRequest', () => {
  it('authenticates a client sent as mixan-client-id (ADR-015 entry 5 deferred)', async () => {
    const result = await validateIngestRequest({
      deps,
      headers: {
        'mixan-client-id': CLIENT_ID,
        'mixan-client-secret': 'legacy-secret',
      },
      clientIp: '203.0.113.10',
      body,
    });

    expect(getClientByIdCached).toHaveBeenCalledWith(deps, CLIENT_ID);
    expect(result.ok && result.client.id).toBe(CLIENT_ID);
    // The fixture stores no secret, so the presented one cannot verify.
    expect(result.secretVerified).toBe(false);
  });

  it('accepts the openpanel-* headers and reports no secret when none was sent', async () => {
    const result = await validateIngestRequest({
      deps,
      headers: { 'openpanel-client-id': CLIENT_ID },
      clientIp: '203.0.113.10',
      body,
    });

    expect(result.ok && result.client.id).toBe(CLIENT_ID);
    expect(result.secretVerified).toBe(false);
  });

  it('falls back to the credentials carried in the body', async () => {
    const result = await validateIngestRequest({
      deps,
      headers: {},
      clientIp: '203.0.113.10',
      body: { ...body, clientId: CLIENT_ID, clientSecret: 'from-body' },
    });

    expect(result.ok && result.client.id).toBe(CLIENT_ID);
    expect(result.secretVerified).toBe(false);
  });

  // A refusal is RETURNED, never thrown: the caller builds the error so its
  // stack is captured outside core's bundle chunk (see client-auth.ts).
  it('refuses a missing client id without throwing', async () => {
    const result = await validateIngestRequest({
      deps,
      headers: {},
      clientIp: '1.2.3.4',
      body,
    });

    expect(result).toMatchObject({
      ok: false,
      message: 'Ingestion: Missing client id',
    });
    expect(getClientByIdCached).not.toHaveBeenCalled();
  });

  it('refuses a client id that is not a UUIDv4', async () => {
    const result = await validateIngestRequest({
      deps,
      headers: { 'openpanel-client-id': 'not-a-uuid' },
      clientIp: '1.2.3.4',
      body,
    });

    expect(result).toMatchObject({
      ok: false,
      message: 'Ingestion: Client ID must be a valid UUIDv4',
    });
  });

  it('redacts the presented secret in the refusal payload', async () => {
    const result = await validateIngestRequest({
      deps,
      headers: {
        'openpanel-client-id': 'not-a-uuid',
        'openpanel-client-secret': 'abcdefghijklmnop',
      },
      clientIp: '1.2.3.4',
      body,
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.payload.clientSecret).toBe(
      'abcde...lmnop'
    );
    expect(result.secretVerified).toBe(false);
  });

  it('refuses revenue tracking without a client secret', async () => {
    const result = await validateIngestRequest({
      deps,
      headers: { 'openpanel-client-id': CLIENT_ID },
      clientIp: '1.2.3.4',
      body: { ...body, properties: { __revenue: 100 } },
    });

    expect(result).toMatchObject({
      ok: false,
      message:
        'Ingestion: Revenue tracking is not allowed without a client secret',
    });
  });

  it('blocks an ip listed in the project filters', async () => {
    getClientByIdCached.mockResolvedValueOnce({
      ...client,
      project: {
        ...client.project,
        filters: [{ type: 'ip', ip: '203.0.113.10' }],
      },
    } as unknown as typeof client);

    const result = await validateIngestRequest({
      deps,
      headers: { 'openpanel-client-id': CLIENT_ID },
      clientIp: '203.0.113.10',
      body,
    });

    expect(result).toMatchObject({
      ok: false,
      message: 'Ingestion: IP address is blocked by project filter',
    });
  });
});

describe('validateIngestRequest — secret verification (main #481)', () => {
  it('does not mark a request authenticated when the secret does not match', async () => {
    guarded();

    const result = await validateIngestRequest({
      deps,
      headers: {
        'openpanel-client-id': CLIENT_ID,
        'openpanel-client-secret': 'guessed',
        origin: ORIGIN,
      },
      clientIp: '1.2.3.4',
      body,
    });

    expect(verifyPassword).toHaveBeenCalledWith('guessed', 'stored-hash');
    expect(result.ok && result.client.id).toBe(CLIENT_ID);
    expect(result.secretVerified).toBe(false);
    expect(redisSetex).not.toHaveBeenCalled();
  });

  it('rejects revenue from an origin-authorized request with a bad secret', async () => {
    guarded();

    const result = await validateIngestRequest({
      deps,
      headers: {
        'openpanel-client-id': CLIENT_ID,
        'openpanel-client-secret': 'guessed',
        origin: ORIGIN,
      },
      clientIp: '1.2.3.4',
      body: { ...body, properties: { __revenue: 42 } },
    });

    expect(verifyPassword).toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      message:
        'Ingestion: Revenue tracking is not allowed without a client secret',
      secretVerified: false,
    });
  });

  it('rejects a bad secret outright when no origin is allowed', async () => {
    guarded();

    const result = await validateIngestRequest({
      deps,
      headers: {
        'openpanel-client-id': CLIENT_ID,
        'openpanel-client-secret': 'guessed',
      },
      clientIp: '1.2.3.4',
      body,
    });

    expect(verifyPassword).toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: false,
      message: 'Ingestion: Invalid cors or secret',
      secretVerified: false,
    });
  });

  it('lets ordinary browser traffic through on the origin alone', async () => {
    guarded();

    const result = await validateIngestRequest({
      deps,
      headers: { 'openpanel-client-id': CLIENT_ID, origin: ORIGIN },
      clientIp: '1.2.3.4',
      body,
    });

    expect(result.ok && result.client.id).toBe(CLIENT_ID);
    expect(result.secretVerified).toBe(false);
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('authorizes a correct secret without an origin and accepts revenue', async () => {
    guarded();
    verifyPassword.mockResolvedValue(true);

    const result = await validateIngestRequest({
      deps,
      headers: {
        'openpanel-client-id': CLIENT_ID,
        'openpanel-client-secret': 'correct',
      },
      clientIp: '1.2.3.4',
      body: { ...body, properties: { __revenue: 42 } },
    });

    expect(verifyPassword).toHaveBeenCalledWith('correct', 'stored-hash');
    expect(result.ok && result.client.id).toBe(CLIENT_ID);
    expect(result.secretVerified).toBe(true);
    expect(redisSetex).toHaveBeenCalledWith(
      expect.stringContaining(`client:auth:${CLIENT_ID}:`),
      300,
      'true'
    );
  });

  it('trusts a cached successful verification without re-hashing', async () => {
    guarded();
    redisGet.mockResolvedValue('true');

    const result = await validateIngestRequest({
      deps,
      headers: {
        'openpanel-client-id': CLIENT_ID,
        'openpanel-client-secret': 'correct',
      },
      clientIp: '1.2.3.4',
      body,
    });

    expect(redisGet).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.secretVerified).toBe(true);
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('does not trust a cached "false" left over from earlier releases', async () => {
    guarded();
    redisGet.mockResolvedValue('false');

    const result = await validateIngestRequest({
      deps,
      headers: {
        'openpanel-client-id': CLIENT_ID,
        'openpanel-client-secret': 'guessed',
        origin: ORIGIN,
      },
      clientIp: '1.2.3.4',
      body,
    });

    expect(redisGet).toHaveBeenCalled();
    expect(verifyPassword).toHaveBeenCalled();
    expect(result.secretVerified).toBe(false);
  });

  it('skips the cache entirely when the client has no stored secret', async () => {
    guarded({ secret: null });

    const result = await validateIngestRequest({
      deps,
      headers: {
        'openpanel-client-id': CLIENT_ID,
        'openpanel-client-secret': 'anything',
        origin: ORIGIN,
      },
      clientIp: '1.2.3.4',
      body,
    });

    expect(getClientByIdCached).toHaveBeenCalled();
    expect(result.secretVerified).toBe(false);
    expect(redisGet).not.toHaveBeenCalled();
    expect(redisSetex).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('accepts revenue with no secret when allowUnsafeRevenueTracking is on', async () => {
    guarded({
      project: { ...guardedClient.project, allowUnsafeRevenueTracking: true },
    });

    const result = await validateIngestRequest({
      deps,
      headers: { 'openpanel-client-id': CLIENT_ID, origin: ORIGIN },
      clientIp: '1.2.3.4',
      body: { ...body, properties: { __revenue: 42 } },
    });

    expect(getClientByIdCached).toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.secretVerified).toBe(false);
  });
});

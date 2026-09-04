/**
 * Tests for validateSdkRequest — the ingestion auth check behind POST /track
 * and the deprecated POST /event.
 *
 * The behaviour guarded here: `req.clientSecretAuth` and revenue ingestion
 * follow whether the supplied secret verified against the stored hash, not
 * whether a secret string was present on the request.
 */

import type { FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyPassword = vi.fn();
const getClientByIdCached = vi.fn();
const redisGet = vi.fn();
const redisSetex = vi.fn();

vi.mock('@openpanel/common/server', () => ({
  verifyPassword: (...args: unknown[]) => verifyPassword(...args),
}));
vi.mock('@openpanel/db', () => ({
  ClientType: { read: 'read', write: 'write', root: 'root' },
  getClientByIdCached: (...args: unknown[]) => getClientByIdCached(...args),
}));
vi.mock('@openpanel/redis', () => ({
  getRedisCache: () => ({ get: redisGet, setex: redisSetex }),
}));

const { validateSdkRequest } = await import('./auth');

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const ORIGIN = 'https://app.example.com';

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    id: CLIENT_ID,
    projectId: 'proj-1',
    secret: 'stored-hash',
    ignoreCorsAndSecret: false,
    ...overrides,
    project: {
      cors: [ORIGIN],
      allowUnsafeRevenueTracking: false,
      filters: [],
      ...((overrides.project as Record<string, unknown>) ?? {}),
    },
  };
}

function makeReq({
  headers = {},
  revenue = false,
}: {
  headers?: Record<string, string>;
  revenue?: boolean;
} = {}) {
  return {
    headers: { 'openpanel-client-id': CLIENT_ID, ...headers },
    clientIp: '1.2.3.4',
    body: {
      type: 'track',
      payload: {
        name: 'purchase',
        properties: revenue ? { __revenue: 42 } : {},
      },
    },
  } as unknown as FastifyRequest<never> & { clientSecretAuth?: boolean };
}

beforeEach(() => {
  verifyPassword.mockReset();
  getClientByIdCached.mockReset();
  redisGet.mockReset();
  redisSetex.mockReset();
  redisGet.mockResolvedValue(null);
  redisSetex.mockResolvedValue('OK');
  getClientByIdCached.mockResolvedValue(makeClient());
});

describe('validateSdkRequest', () => {
  it('does not mark a request authenticated when the secret does not match', async () => {
    verifyPassword.mockResolvedValue(false);
    const req = makeReq({
      headers: { origin: ORIGIN, 'openpanel-client-secret': 'guessed' },
    });

    await expect(validateSdkRequest(req as never)).resolves.toMatchObject({
      id: CLIENT_ID,
    });
    expect(req.clientSecretAuth).toBe(false);
    expect(redisSetex).not.toHaveBeenCalled();
  });

  it('rejects revenue from an origin-authorized request with a bad secret', async () => {
    verifyPassword.mockResolvedValue(false);
    const req = makeReq({
      headers: { origin: ORIGIN, 'openpanel-client-secret': 'guessed' },
      revenue: true,
    });

    await expect(validateSdkRequest(req as never)).rejects.toThrow(
      'Revenue tracking is not allowed without a client secret'
    );
    expect(req.clientSecretAuth).toBe(false);
  });

  it('rejects a bad secret outright when no origin is allowed', async () => {
    verifyPassword.mockResolvedValue(false);
    const req = makeReq({
      headers: { 'openpanel-client-secret': 'guessed' },
    });

    await expect(validateSdkRequest(req as never)).rejects.toThrow(
      'Invalid cors or secret'
    );
    expect(req.clientSecretAuth).toBe(false);
  });

  it('lets ordinary browser traffic through on the origin alone', async () => {
    const req = makeReq({ headers: { origin: ORIGIN } });

    await expect(validateSdkRequest(req as never)).resolves.toMatchObject({
      id: CLIENT_ID,
    });
    expect(req.clientSecretAuth).toBe(false);
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('authorizes a correct secret without an origin and accepts revenue', async () => {
    verifyPassword.mockResolvedValue(true);
    const req = makeReq({
      headers: { 'openpanel-client-secret': 'correct' },
      revenue: true,
    });

    await expect(validateSdkRequest(req as never)).resolves.toMatchObject({
      id: CLIENT_ID,
    });
    expect(req.clientSecretAuth).toBe(true);
    expect(redisSetex).toHaveBeenCalledWith(
      expect.stringContaining(`client:auth:${CLIENT_ID}:`),
      300,
      'true'
    );
  });

  it('trusts a cached successful verification without re-hashing', async () => {
    redisGet.mockResolvedValue('true');
    const req = makeReq({ headers: { 'openpanel-client-secret': 'correct' } });

    await validateSdkRequest(req as never);

    expect(req.clientSecretAuth).toBe(true);
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('does not trust a cached "false" left over from earlier releases', async () => {
    redisGet.mockResolvedValue('false');
    verifyPassword.mockResolvedValue(false);
    const req = makeReq({
      headers: { origin: ORIGIN, 'openpanel-client-secret': 'guessed' },
    });

    await validateSdkRequest(req as never);

    expect(req.clientSecretAuth).toBe(false);
    expect(verifyPassword).toHaveBeenCalled();
  });

  it('skips the cache entirely when the client has no stored secret', async () => {
    getClientByIdCached.mockResolvedValue(makeClient({ secret: null }));
    const req = makeReq({
      headers: { origin: ORIGIN, 'openpanel-client-secret': 'anything' },
    });

    await validateSdkRequest(req as never);

    expect(req.clientSecretAuth).toBe(false);
    expect(redisGet).not.toHaveBeenCalled();
    expect(redisSetex).not.toHaveBeenCalled();
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('accepts revenue with no secret when allowUnsafeRevenueTracking is on', async () => {
    getClientByIdCached.mockResolvedValue(
      makeClient({ project: { allowUnsafeRevenueTracking: true } })
    );
    const req = makeReq({ headers: { origin: ORIGIN }, revenue: true });

    await expect(validateSdkRequest(req as never)).resolves.toMatchObject({
      id: CLIENT_ID,
    });
    expect(req.clientSecretAuth).toBe(false);
  });

  it('rejects revenue with no secret when allowUnsafeRevenueTracking is off', async () => {
    const req = makeReq({ headers: { origin: ORIGIN }, revenue: true });

    await expect(validateSdkRequest(req as never)).rejects.toThrow(
      'Revenue tracking is not allowed without a client secret'
    );
  });
});

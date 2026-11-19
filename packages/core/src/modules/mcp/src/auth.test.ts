import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';

const mockGetClientByIdCached = mock();
const mockVerifyPassword = mock();
const mockGetCache = mock();
const noopLogger = {
  fatal: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
  trace: () => {},
  child: () => noopLogger,
};

// Only `@openpanel/redis`'s `getCache` and argon2 verification are mocked, at
// the specifier the source resolves to: a whole-barrel replacement would drop
// every other export for other files sharing this process.
const actualRedis = await import('@openpanel/redis');
mock.module('@openpanel/redis', () => ({
  ...actualRedis,
  getCache: mockGetCache,
}));

const actualCrypto = await import('@openpanel/shared/server');
mock.module('@openpanel/shared/server', () => ({
  ...actualCrypto,
  verifyPassword: mockVerifyPassword,
}));

import type { ServiceDeps, Services } from '../../../services';

const deps = { logger: noopLogger } as unknown as ServiceDeps;
const services = {
  client: { getClientByIdCached: mockGetClientByIdCached },
} as unknown as Services;

let authenticate: (
  token: string | undefined
) => ReturnType<typeof import('./auth').authenticateToken>;
let authenticateToken: typeof import('./auth').authenticateToken;
let extractToken: typeof import('./auth').extractToken;
let McpAuthError: typeof import('./auth').McpAuthError;

beforeAll(async () => {
  ({ authenticateToken, extractToken, McpAuthError } = await import('./auth'));
  authenticate = (token) => authenticateToken(deps, services, token);
});

beforeEach(() => {
  mockGetClientByIdCached.mockReset();
  mockVerifyPassword.mockReset();
  mockGetCache.mockReset();
  // Default: cache calls through to the fn
  mockGetCache.mockImplementation(
    (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn()
  );
  mockVerifyPassword.mockResolvedValue(true);
});

const VALID_CLIENT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_SECRET = 'mysecret';
const VALID_TOKEN = Buffer.from(`${VALID_CLIENT_ID}:${VALID_SECRET}`).toString(
  'base64'
);

const baseClient = {
  id: VALID_CLIENT_ID,
  secret: 'hashed_secret',
  type: 'read',
  projectId: 'proj-123',
  organizationId: 'org-456',
};

describe('extractToken', () => {
  it('returns token from ?token= query param', () => {
    expect(extractToken({ token: 'abc' }, undefined)).toBe('abc');
  });

  it('returns token from Authorization Bearer header', () => {
    expect(extractToken({}, 'Bearer mytoken')).toBe('mytoken');
  });

  it('prefers query param over header', () => {
    expect(extractToken({ token: 'from-query' }, 'Bearer from-header')).toBe(
      'from-query'
    );
  });

  it('returns undefined when neither is present', () => {
    expect(extractToken({}, undefined)).toBeUndefined();
  });

  it('returns undefined for non-Bearer auth header', () => {
    expect(extractToken({}, 'Basic abc123')).toBeUndefined();
  });
});

describe('authenticateToken', () => {
  it('throws McpAuthError when token is missing', async () => {
    await expect(authenticate(undefined)).rejects.toThrow(McpAuthError);
    await expect(authenticate(undefined)).rejects.toThrow(
      'Missing authentication token'
    );
  });

  it('throws McpAuthError for non-base64 token', async () => {
    // Buffer.from with invalid base64 doesn't throw — but the decoded result won't have a colon
    await expect(authenticate('!!!invalid!!!')).rejects.toThrow(McpAuthError);
  });

  it('throws McpAuthError when token has no colon separator', async () => {
    const token = Buffer.from('nodivider').toString('base64');
    await expect(authenticate(token)).rejects.toThrow('Invalid token format');
  });

  it('throws McpAuthError when clientId is not a UUID', async () => {
    const token = Buffer.from('not-a-uuid:secret').toString('base64');
    await expect(authenticate(token)).rejects.toThrow(
      'Invalid client ID format'
    );
  });

  it('throws McpAuthError when clientSecret is empty', async () => {
    const token = Buffer.from(`${VALID_CLIENT_ID}:`).toString('base64');
    await expect(authenticate(token)).rejects.toThrow(
      'Client secret is required'
    );
  });

  it('throws McpAuthError when client is not found', async () => {
    mockGetClientByIdCached.mockResolvedValue(null);
    await expect(authenticate(VALID_TOKEN)).rejects.toThrow(
      'Invalid credentials'
    );
  });

  it('throws McpAuthError when client has no stored secret', async () => {
    mockGetClientByIdCached.mockResolvedValue({ ...baseClient, secret: null });
    await expect(authenticate(VALID_TOKEN)).rejects.toThrow('no secret');
  });

  it('throws McpAuthError for write-only clients', async () => {
    mockGetClientByIdCached.mockResolvedValue({ ...baseClient, type: 'write' });
    await expect(authenticate(VALID_TOKEN)).rejects.toThrow(
      'Write-only clients'
    );
  });

  it('throws McpAuthError when password verification fails', async () => {
    mockGetClientByIdCached.mockResolvedValue(baseClient);
    mockVerifyPassword.mockResolvedValue(false);
    await expect(authenticate(VALID_TOKEN)).rejects.toThrow(
      'Invalid credentials'
    );
  });

  it('returns read client context on success', async () => {
    mockGetClientByIdCached.mockResolvedValue(baseClient);
    const ctx = await authenticate(VALID_TOKEN);
    expect(ctx).toEqual({
      projectId: 'proj-123',
      organizationId: 'org-456',
      clientType: 'read',
    });
  });

  it('returns root client context with null projectId', async () => {
    mockGetClientByIdCached.mockResolvedValue({
      ...baseClient,
      type: 'root',
      projectId: null,
    });
    const ctx = await authenticate(VALID_TOKEN);
    expect(ctx).toEqual({
      projectId: null,
      organizationId: 'org-456',
      clientType: 'root',
    });
  });

  it('uses cache for password verification', async () => {
    mockGetClientByIdCached.mockResolvedValue(baseClient);
    // Simulate cache returning true without calling verifyPassword
    mockGetCache.mockResolvedValue(true);
    const ctx = await authenticate(VALID_TOKEN);
    expect(ctx.clientType).toBe('read');
    expect(mockVerifyPassword).not.toHaveBeenCalled();
  });

  it('cache key uses SHA-256 hash, not raw secret', async () => {
    mockGetClientByIdCached.mockResolvedValue(baseClient);
    let capturedKey = '';
    mockGetCache.mockImplementation(
      (key: string, _ttl: number, fn: () => Promise<unknown>) => {
        capturedKey = key;
        return fn();
      }
    );
    await authenticate(VALID_TOKEN);
    expect(capturedKey).toContain(`mcp:auth:${VALID_CLIENT_ID}:`);
    expect(capturedKey).not.toContain(VALID_SECRET);
    expect(capturedKey).not.toContain(
      Buffer.from(VALID_SECRET).toString('base64')
    );
  });
});

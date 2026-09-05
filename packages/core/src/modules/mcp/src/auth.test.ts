import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';

const mockGetClientByIdCached = mock();
const mockVerifyPassword = mock();
const mockGetCache = mock();
const noopLogger = {
  fatal: () => {
    // no-op
  },
  error: () => {
    // no-op
  },
  warn: () => {
    // no-op
  },
  info: () => {
    // no-op
  },
  debug: () => {
    // no-op
  },
  trace: () => {
    // no-op
  },
  child: () => noopLogger,
};

// Mocked at the specifier the source imports resolve to, not at the
// '@openpanel/db' / '@openpanel/redis' barrels — a whole-barrel replacement
// would drop every other export those barrels carry for any other file
// sharing this process (bun:test only isolates modules per file under
// `--isolate`; see AGENTS.md).
const actualClientsService = await import(
  '@openpanel/core'
);
mock.module('@openpanel/core', () => ({
  ...actualClientsService,
  getClientByIdCached: mockGetClientByIdCached,
}));

const actualRedis = await import('@openpanel/redis');
mock.module('@openpanel/redis', () => ({
  ...actualRedis,
  getCache: mockGetCache,
}));

// @openpanel/db's barrel eagerly imports @openpanel/core's (buffers/
// base-buffer.ts, see packages/core/src/index.ts's comment on the mcp
// loader) — so a partial replacement here breaks that self-referential
// import for anything auth.ts's own `@openpanel/db` import drags in, not
// just this file's direct callers.
const actualLogger = await import('../../../clients/logger');
mock.module('../../../clients/logger', () => ({
  ...actualLogger,
  createLogger: () => noopLogger,
}));

const actualCrypto = await import('../../../shared/crypto');
mock.module('../../../shared/crypto', () => ({
  ...actualCrypto,
  verifyPassword: mockVerifyPassword,
}));

let authenticateToken: typeof import('./auth').authenticateToken;
let extractToken: typeof import('./auth').extractToken;
let McpAuthError: typeof import('./auth').McpAuthError;

beforeAll(async () => {
  ({ authenticateToken, extractToken, McpAuthError } = await import('./auth'));
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

// ---------------------------------------------------------------------------
// extractToken
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// authenticateToken
// ---------------------------------------------------------------------------

describe('authenticateToken', () => {
  it('throws McpAuthError when token is missing', async () => {
    await expect(authenticateToken(undefined)).rejects.toThrow(McpAuthError);
    await expect(authenticateToken(undefined)).rejects.toThrow(
      'Missing authentication token'
    );
  });

  it('throws McpAuthError for non-base64 token', async () => {
    // Buffer.from with invalid base64 doesn't throw — but the decoded result won't have a colon
    await expect(authenticateToken('!!!invalid!!!')).rejects.toThrow(
      McpAuthError
    );
  });

  it('throws McpAuthError when token has no colon separator', async () => {
    const token = Buffer.from('nodivider').toString('base64');
    await expect(authenticateToken(token)).rejects.toThrow(
      'Invalid token format'
    );
  });

  it('throws McpAuthError when clientId is not a UUID', async () => {
    const token = Buffer.from('not-a-uuid:secret').toString('base64');
    await expect(authenticateToken(token)).rejects.toThrow(
      'Invalid client ID format'
    );
  });

  it('throws McpAuthError when clientSecret is empty', async () => {
    const token = Buffer.from(`${VALID_CLIENT_ID}:`).toString('base64');
    await expect(authenticateToken(token)).rejects.toThrow(
      'Client secret is required'
    );
  });

  it('throws McpAuthError when client is not found', async () => {
    mockGetClientByIdCached.mockResolvedValue(null);
    await expect(authenticateToken(VALID_TOKEN)).rejects.toThrow(
      'Invalid credentials'
    );
  });

  it('throws McpAuthError when client has no stored secret', async () => {
    mockGetClientByIdCached.mockResolvedValue({ ...baseClient, secret: null });
    await expect(authenticateToken(VALID_TOKEN)).rejects.toThrow('no secret');
  });

  it('throws McpAuthError for write-only clients', async () => {
    mockGetClientByIdCached.mockResolvedValue({ ...baseClient, type: 'write' });
    await expect(authenticateToken(VALID_TOKEN)).rejects.toThrow(
      'Write-only clients'
    );
  });

  it('throws McpAuthError when password verification fails', async () => {
    mockGetClientByIdCached.mockResolvedValue(baseClient);
    mockVerifyPassword.mockResolvedValue(false);
    await expect(authenticateToken(VALID_TOKEN)).rejects.toThrow(
      'Invalid credentials'
    );
  });

  it('returns read client context on success', async () => {
    mockGetClientByIdCached.mockResolvedValue(baseClient);
    const ctx = await authenticateToken(VALID_TOKEN);
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
    const ctx = await authenticateToken(VALID_TOKEN);
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
    const ctx = await authenticateToken(VALID_TOKEN);
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
    await authenticateToken(VALID_TOKEN);
    expect(capturedKey).toContain(`mcp:auth:${VALID_CLIENT_ID}:`);
    expect(capturedKey).not.toContain(VALID_SECRET);
    expect(capturedKey).not.toContain(
      Buffer.from(VALID_SECRET).toString('base64')
    );
  });
});

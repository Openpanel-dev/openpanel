import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockGetClientByIdCached = vi.hoisted(() => vi.fn());
const mockVerifyPassword = vi.hoisted(() => vi.fn());
const mockGetCache = vi.hoisted(() => vi.fn());

vi.mock('@openpanel/db', () => ({
  ClientType: { write: 'write', read: 'read', root: 'root' },
  getClientByIdCached: mockGetClientByIdCached,
}));

vi.mock('@openpanel/common/server', () => ({
  verifyPassword: mockVerifyPassword,
}));

vi.mock('@openpanel/redis', () => ({
  getCache: mockGetCache,
}));

import { McpAuthError, authenticateToken, extractToken } from './auth';

const VALID_CLIENT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const VALID_SECRET = 'mysecret';
const VALID_TOKEN = Buffer.from(`${VALID_CLIENT_ID}:${VALID_SECRET}`).toString('base64');

const baseClient = {
  id: VALID_CLIENT_ID,
  secret: 'hashed_secret',
  type: 'read',
  projectId: 'proj-123',
  organizationId: 'org-456',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: cache calls through to the fn
  mockGetCache.mockImplementation((_key: string, _ttl: number, fn: () => Promise<unknown>) => fn());
  mockVerifyPassword.mockResolvedValue(true);
});

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
    expect(extractToken({ token: 'from-query' }, 'Bearer from-header')).toBe('from-query');
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
    await expect(authenticateToken(undefined)).rejects.toThrow('Missing authentication token');
  });

  it('throws McpAuthError for non-base64 token', async () => {
    // Buffer.from with invalid base64 doesn't throw — but the decoded result won't have a colon
    await expect(authenticateToken('!!!invalid!!!')).rejects.toThrow(McpAuthError);
  });

  it('throws McpAuthError when token has no colon separator', async () => {
    const token = Buffer.from('nodivider').toString('base64');
    await expect(authenticateToken(token)).rejects.toThrow('Invalid token format');
  });

  it('throws McpAuthError when clientId is not a UUID', async () => {
    const token = Buffer.from('not-a-uuid:secret').toString('base64');
    await expect(authenticateToken(token)).rejects.toThrow('Invalid client ID format');
  });

  it('throws McpAuthError when clientSecret is empty', async () => {
    const token = Buffer.from(`${VALID_CLIENT_ID}:`).toString('base64');
    await expect(authenticateToken(token)).rejects.toThrow('Client secret is required');
  });

  it('throws McpAuthError when client is not found', async () => {
    mockGetClientByIdCached.mockResolvedValue(null);
    await expect(authenticateToken(VALID_TOKEN)).rejects.toThrow('Invalid credentials');
  });

  it('throws McpAuthError when client has no stored secret', async () => {
    mockGetClientByIdCached.mockResolvedValue({ ...baseClient, secret: null });
    await expect(authenticateToken(VALID_TOKEN)).rejects.toThrow('no secret');
  });

  it('throws McpAuthError for write-only clients', async () => {
    mockGetClientByIdCached.mockResolvedValue({ ...baseClient, type: 'write' });
    await expect(authenticateToken(VALID_TOKEN)).rejects.toThrow('Write-only clients');
  });

  it('throws McpAuthError when password verification fails', async () => {
    mockGetClientByIdCached.mockResolvedValue(baseClient);
    mockVerifyPassword.mockResolvedValue(false);
    await expect(authenticateToken(VALID_TOKEN)).rejects.toThrow('Invalid credentials');
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
    mockGetClientByIdCached.mockResolvedValue({ ...baseClient, type: 'root', projectId: null });
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
    mockGetCache.mockImplementation((key: string, _ttl: number, fn: () => Promise<unknown>) => {
      capturedKey = key;
      return fn();
    });
    await authenticateToken(VALID_TOKEN);
    expect(capturedKey).toContain(`mcp:auth:${VALID_CLIENT_ID}:`);
    expect(capturedKey).not.toContain(VALID_SECRET);
    expect(capturedKey).not.toContain(Buffer.from(VALID_SECRET).toString('base64'));
  });
});

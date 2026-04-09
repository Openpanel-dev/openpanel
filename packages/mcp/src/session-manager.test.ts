import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { McpAuthContext } from './auth';

const mockSetJson = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockGetJson = vi.hoisted(() => vi.fn());
const mockExpire = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockDel = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@openpanel/redis', () => ({
  getRedisCache: () => ({
    setJson: mockSetJson,
    getJson: mockGetJson,
    expire: mockExpire,
    del: mockDel,
  }),
}));

vi.mock('@openpanel/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { SessionManager } from './session-manager';

const CTX: McpAuthContext = {
  projectId: 'proj-1',
  organizationId: 'org-1',
  clientType: 'read',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SessionManager', () => {
  describe('generateId', () => {
    it('generates unique UUIDs', () => {
      const sm = new SessionManager();
      const a = sm.generateId();
      const b = sm.generateId();
      expect(a).not.toBe(b);
      expect(a).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('context (Redis)', () => {
    it('stores context in Redis with TTL', async () => {
      const sm = new SessionManager();
      await sm.setContext('sess-1', CTX);
      expect(mockSetJson).toHaveBeenCalledWith('mcp:session:sess-1', 30 * 60, CTX);
    });

    it('retrieves context from Redis', async () => {
      const sm = new SessionManager();
      mockGetJson.mockResolvedValue(CTX);
      const result = await sm.getContext('sess-1');
      expect(result).toEqual(CTX);
      expect(mockGetJson).toHaveBeenCalledWith('mcp:session:sess-1');
    });

    it('returns null for missing session', async () => {
      const sm = new SessionManager();
      mockGetJson.mockResolvedValue(null);
      const result = await sm.getContext('missing');
      expect(result).toBeNull();
    });

    it('touches TTL on touchContext', async () => {
      const sm = new SessionManager();
      await sm.touchContext('sess-1');
      expect(mockExpire).toHaveBeenCalledWith('mcp:session:sess-1', 30 * 60);
    });

    it('deletes context from Redis', async () => {
      const sm = new SessionManager();
      await sm.deleteContext('sess-1');
      expect(mockDel).toHaveBeenCalledWith('mcp:session:sess-1');
    });
  });

  describe('close', () => {
    it('deletes session from Redis', async () => {
      const sm = new SessionManager();
      await sm.close('sess-1');
      expect(mockDel).toHaveBeenCalledWith('mcp:session:sess-1');
    });
  });

  describe('destroy', () => {
    it('is a no-op (sessions are in Redis, not in-process)', async () => {
      const sm = new SessionManager();
      await expect(sm.destroy()).resolves.toBeUndefined();
    });
  });
});

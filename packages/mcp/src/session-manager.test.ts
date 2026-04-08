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

const mockTransport = {
  close: vi.fn().mockResolvedValue(undefined),
};

const mockServer = {} as any;

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

  describe('local transport', () => {
    it('stores and retrieves local session', () => {
      const sm = new SessionManager();
      sm.setLocal('sess-1', { server: mockServer, transport: mockTransport as any });
      expect(sm.getLocal('sess-1')).toBeDefined();
    });

    it('returns undefined for unknown session', () => {
      const sm = new SessionManager();
      expect(sm.getLocal('unknown')).toBeUndefined();
    });

    it('deletes local session', () => {
      const sm = new SessionManager();
      sm.setLocal('sess-1', { server: mockServer, transport: mockTransport as any });
      sm.deleteLocal('sess-1');
      expect(sm.getLocal('sess-1')).toBeUndefined();
    });

    it('tracks localSize correctly', () => {
      const sm = new SessionManager();
      expect(sm.localSize).toBe(0);
      sm.setLocal('a', { server: mockServer, transport: mockTransport as any });
      sm.setLocal('b', { server: mockServer, transport: mockTransport as any });
      expect(sm.localSize).toBe(2);
      sm.deleteLocal('a');
      expect(sm.localSize).toBe(1);
    });
  });

  describe('close', () => {
    it('closes transport, removes local session, and deletes Redis context', async () => {
      const sm = new SessionManager();
      sm.setLocal('sess-1', { server: mockServer, transport: mockTransport as any });
      await sm.close('sess-1');

      expect(mockTransport.close).toHaveBeenCalled();
      expect(sm.getLocal('sess-1')).toBeUndefined();
      expect(mockDel).toHaveBeenCalledWith('mcp:session:sess-1');
    });

    it('still removes Redis context even when no local session exists', async () => {
      const sm = new SessionManager();
      await sm.close('no-local-sess');
      expect(mockDel).toHaveBeenCalledWith('mcp:session:no-local-sess');
      expect(mockTransport.close).not.toHaveBeenCalled();
    });

    it('does not throw if transport.close fails', async () => {
      const sm = new SessionManager();
      const failingTransport = { close: vi.fn().mockRejectedValue(new Error('already closed')) };
      sm.setLocal('sess-1', { server: mockServer, transport: failingTransport as any });
      await expect(sm.close('sess-1')).resolves.toBeUndefined();
    });
  });

  describe('destroy', () => {
    it('closes all local sessions', async () => {
      const sm = new SessionManager();
      const t1 = { close: vi.fn().mockResolvedValue(undefined) };
      const t2 = { close: vi.fn().mockResolvedValue(undefined) };
      sm.setLocal('a', { server: mockServer, transport: t1 as any });
      sm.setLocal('b', { server: mockServer, transport: t2 as any });

      await sm.destroy();

      expect(t1.close).toHaveBeenCalled();
      expect(t2.close).toHaveBeenCalled();
      expect(sm.localSize).toBe(0);
    });
  });
});

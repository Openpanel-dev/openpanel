/**
 * `auth.test.ts` covers `authenticateToken`/`extractToken` in isolation, and
 * `src/integration/tools.test.ts` covers tool business logic against real
 * ClickHouse — neither exercises this file's own logic: turning one HTTP POST
 * into a real MCP JSON-RPC exchange (auth → ephemeral server → synthetic
 * initialize handshake → dispatch → response), with no session surviving
 * between requests. This file is that missing layer: auth is mocked (already
 * proven elsewhere), everything from `createMcpServer` down — the real SDK
 * server, `InMemoryTransport`, the wire-format handshake, tool registration
 * and dispatch — runs for real.
 *
 * Mocked at the specifiers the source imports resolve to, not the
 * '@openpanel/db' / '@openpanel/redis' barrels — a whole-barrel replacement
 * would drop every other export those barrels carry for any other file
 * sharing this process (bun:test only isolates modules per file under
 * `--isolate`; `cd packages/core && bun test` in CI runs without it — see
 * AGENTS.md). Every mocked specifier is restored in `afterAll` from a
 * plain-object snapshot taken before the first `mock.module` call — restoring
 * via the live `await import(...)` binding itself is a no-op once mocked,
 * since namespace bindings track the current mock.
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

// Real pino (not mocked) instantiates a pino-pretty transport worker thread
// whenever NODE_ENV isn't 'production' — `createLogger`'s own condition, see
// clients/logger.ts. That transport intermittently fails to spawn under Bun
// ("unable to determine transport target for pino-pretty"), and this file
// exercises `createMcpServer` for real, so every tool module's own
// `createLogger` call would add to that risk. Noop it out, same as
// `src/auth.test.ts` already does for the same reason.
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
const actualLogger = await import('../../clients/logger');
const realLogger = { ...actualLogger };
mock.module('../../clients/logger', () => ({
  ...realLogger,
  createLogger: () => noopLogger,
}));

const mockGetClientByIdCached = mock();
const actualClientsService = await import(
  '@openpanel/db/src/services/clients.service'
);
const realClientsService = { ...actualClientsService };
mock.module('@openpanel/db/src/services/clients.service', () => ({
  ...realClientsService,
  getClientByIdCached: mockGetClientByIdCached,
}));

const actualRedis = await import('@openpanel/redis');
const realRedis = { ...actualRedis };
mock.module('@openpanel/redis', () => ({
  ...realRedis,
  getCache: async <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
}));

const mockVerifyPassword = mock(async () => true);
const actualCrypto = await import('../../shared/crypto');
const realCrypto = { ...actualCrypto };
mock.module('../../shared/crypto', () => ({
  ...realCrypto,
  verifyPassword: mockVerifyPassword,
}));

// Only `list_projects` (the tool this file dispatches through a real
// `tools/call`) touches Postgres — `db.project.findUnique` is the one method
// it needs.
const mockFindUnique = mock();
const actualPrismaClient = await import('@openpanel/db/src/prisma-client');
const realPrismaClient = { ...actualPrismaClient };
mock.module('@openpanel/db/src/prisma-client', () => ({
  ...realPrismaClient,
  db: { project: { findUnique: mockFindUnique } },
}));

afterAll(() => {
  mock.module('../../clients/logger', () => realLogger);
  mock.module(
    '@openpanel/db/src/services/clients.service',
    () => realClientsService
  );
  mock.module('@openpanel/redis', () => realRedis);
  mock.module('../../shared/crypto', () => realCrypto);
  mock.module('@openpanel/db/src/prisma-client', () => realPrismaClient);
});

let handleStatelessMcpRequest: typeof import('./mcp.service').handleStatelessMcpRequest;

beforeAll(async () => {
  ({ handleStatelessMcpRequest } = await import('./mcp.service'));
});

const CLIENT_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const CLIENT_SECRET = 'mysecret';
const VALID_TOKEN = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
  'base64'
);

const READ_CLIENT = {
  id: CLIENT_ID,
  type: 'read',
  secret: 'hashed-secret',
  projectId: 'proj-1',
  organizationId: 'org-1',
};

beforeEach(() => {
  mockGetClientByIdCached.mockReset();
  mockGetClientByIdCached.mockResolvedValue(READ_CLIENT);
  mockVerifyPassword.mockReset();
  mockVerifyPassword.mockResolvedValue(true);
  mockFindUnique.mockReset();
});

describe('handleStatelessMcpRequest — auth', () => {
  it('401s a request with no token, without ever reaching the MCP server', async () => {
    const res = await handleStatelessMcpRequest(undefined, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    expect(res).toEqual({
      status: 401,
      body: { error: 'Missing authentication token' },
    });
    expect(mockGetClientByIdCached).not.toHaveBeenCalled();
  });

  it('401s a request with a wrong secret', async () => {
    mockVerifyPassword.mockResolvedValue(false);

    const res = await handleStatelessMcpRequest(VALID_TOKEN, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });

    expect(res.status).toBe(401);
  });
});

describe('handleStatelessMcpRequest — protocol', () => {
  it('202s a notification and never runs it through the MCP server', async () => {
    const res = await handleStatelessMcpRequest(VALID_TOKEN, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    // Authenticated (mock hit) but no `id` — dispatch never happens.
    expect(res).toEqual({ status: 202, body: null });
    expect(mockGetClientByIdCached).toHaveBeenCalledTimes(1);
  });

  it('completes a real initialize handshake sent as the request itself', async () => {
    const res = await handleStatelessMcpRequest(VALID_TOKEN, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '0' },
      },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      jsonrpc: string;
      id: number;
      result: { serverInfo: { name: string; version: string } };
    };
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe(1);
    expect(body.result.serverInfo).toEqual({
      name: 'OpenPanel',
      version: '1.0.0',
    });
  });

  it('dispatches tools/list via the synthetic handshake when no prior initialize was sent', async () => {
    const res = await handleStatelessMcpRequest(VALID_TOKEN, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    expect(res.status).toBe(200);
    const body = res.body as { result: { tools: { name: string }[] } };
    const names = body.result.tools.map((tool) => tool.name);
    expect(names).toContain('list_projects');
    // Every analytics/gsc/dashboard tool module registered — a stand-in for
    // "the whole real tool tree wired up", not tied to an exact count.
    expect(names.length).toBeGreaterThan(20);
  });

  it('dispatches a real tools/call end-to-end — JSON-RPC in, real tool handler out', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'proj-1',
      name: 'My Project',
      organizationId: 'org-1',
      eventsCount: 42,
      domain: null,
      types: [],
    });

    const res = await handleStatelessMcpRequest(VALID_TOKEN, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_projects', arguments: {} },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      result: { content: [{ type: 'text'; text: string }] };
    };
    expect(JSON.parse(body.result.content[0]!.text)).toEqual({
      clientType: 'read',
      projects: [
        {
          id: 'proj-1',
          name: 'My Project',
          organizationId: 'org-1',
          eventsCount: 42,
          domain: null,
          types: [],
        },
      ],
    });
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: 'proj-1' },
      select: expect.any(Object),
    });
  });

  it('re-authenticates from scratch on every call — no session survives between requests', async () => {
    const first = await handleStatelessMcpRequest(VALID_TOKEN, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/list',
    });
    const second = await handleStatelessMcpRequest(VALID_TOKEN, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/list',
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockGetClientByIdCached).toHaveBeenCalledTimes(2);
  });
});

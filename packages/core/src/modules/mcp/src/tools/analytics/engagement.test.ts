import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from 'bun:test';
import type { ServiceDeps } from '../../../../../services';
import type { McpToolDeps } from '../shared';

const mockGetRetentionLastSeenSeries = mock();

// Mocked at the specifier the source imports resolve to — a whole-barrel
// replacement would drop every other export those modules carry for any
// other file sharing this process. Restored in `afterAll` from a
// plain-object snapshot taken BEFORE the first `mock.module` call: restoring
// via the live `await import(...)` binding is a no-op once mocked.
const actualRetention = await import('../../../../chart/retention.service');
const realRetention = { ...actualRetention };
mock.module('../../../../chart/retention.service', () => ({
  ...realRetention,
  getRetentionLastSeenSeries: mockGetRetentionLastSeenSeries,
}));

const actualProjectService = await import(
  '../../../../project/project.service'
);
const realProjectService = { ...actualProjectService };
mock.module('../../../../project/project.service', () => ({
  ...realProjectService,
  resolveClientProjectId: mock(
    (_deps: unknown, { clientProjectId }: { clientProjectId: string }) =>
      Promise.resolve(clientProjectId)
  ),
}));

afterAll(() => {
  mock.module('../../../../chart/retention.service', () => realRetention);
  mock.module('../../../../project/project.service', () => realProjectService);
});

let registerEngagementTools: typeof import('./engagement').registerEngagementTools;

beforeAll(async () => {
  ({ registerEngagementTools } = await import('./engagement'));
});

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

// Minimal test double for McpServer — captures the registered tool's
// handler so it can be invoked directly.
function makeServer() {
  let handler: ((input: unknown) => Promise<unknown>) | null = null;
  return {
    tool: (
      _name: string,
      _desc: string,
      _schema: unknown,
      fn: (input: unknown) => Promise<unknown>
    ) => {
      handler = fn;
    },
    invoke: (input: unknown) => {
      if (!handler) {
        throw new Error('tool not registered');
      }
      return handler(input);
    },
  };
}

const READ_CTX = {
  projectId: 'proj-1',
  organizationId: 'org-1',
  clientType: 'read' as const,
};

/** What `createMcpServer` hands every tool at runtime. */
const TOOLS: McpToolDeps = {
  context: READ_CTX,
  dbJsonNull: null,
  deps: { logger: noopLogger } as unknown as ServiceDeps,
  services: {} as McpToolDeps['services'],
};

beforeEach(() => {
  mockGetRetentionLastSeenSeries.mockReset();
});

describe('get_user_last_seen_distribution — bucketing', () => {
  it('correctly buckets users into recency segments', async () => {
    mockGetRetentionLastSeenSeries.mockResolvedValue([
      { days: 0, users: 10 },
      { days: 3, users: 20 },
      { days: 7, users: 5 }, // still in 0-7
      { days: 10, users: 8 }, // 8-14
      { days: 14, users: 2 }, // 8-14
      { days: 20, users: 12 }, // 15-30
      { days: 45, users: 6 }, // 31-60
      { days: 90, users: 3 }, // 60+
    ]);

    const server = makeServer() as any;
    registerEngagementTools(server, TOOLS);
    const result = (await server.invoke({
      projectId: READ_CTX.projectId,
    })) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.summary.active_last_7_days).toBe(10 + 20 + 5); // 35
    expect(content.summary.active_8_to_14_days).toBe(8 + 2); // 10
    expect(content.summary.active_15_to_30_days).toBe(12);
    expect(content.summary.inactive_31_to_60_days).toBe(6);
    expect(content.summary.churned_60_plus_days).toBe(3);
    expect(content.summary.total_identified_users).toBe(66);
  });

  it('returns zero counts when no data', async () => {
    mockGetRetentionLastSeenSeries.mockResolvedValue([]);

    const server = makeServer() as any;
    registerEngagementTools(server, TOOLS);
    const result = (await server.invoke({
      projectId: READ_CTX.projectId,
    })) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.summary.total_identified_users).toBe(0);
    expect(content.summary.active_last_7_days).toBe(0);
    expect(content.summary.churned_60_plus_days).toBe(0);
  });

  it('omits the raw distribution unless it is asked for', async () => {
    mockGetRetentionLastSeenSeries.mockResolvedValue([{ days: 1, users: 5 }]);

    const server = makeServer() as any;
    registerEngagementTools(server, TOOLS);
    const result = (await server.invoke({
      projectId: READ_CTX.projectId,
    })) as any;
    const content = JSON.parse(result.content[0].text);

    // One row per distinct "days ago" is unbounded; the buckets answer the
    // question, so the histogram is opt-in.
    expect(content.distribution).toBeUndefined();
    expect(content.summary.active_last_7_days).toBe(5);
  });

  it('returns the raw distribution as a table when includeDistribution is set', async () => {
    mockGetRetentionLastSeenSeries.mockResolvedValue([
      { days: 1, users: 5 },
      { days: 40, users: 2 },
    ]);

    const server = makeServer() as any;
    registerEngagementTools(server, TOOLS);
    const result = (await server.invoke({
      projectId: READ_CTX.projectId,
      includeDistribution: true,
    })) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.distribution.columns).toEqual(['days', 'users']);
    expect(content.distribution.rows).toEqual([
      [1, 5],
      [40, 2],
    ]);
  });
});

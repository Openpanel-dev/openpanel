import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetRetentionLastSeenSeries = vi.hoisted(() => vi.fn());

vi.mock('@openpanel/db', () => ({
  getRetentionLastSeenSeries: mockGetRetentionLastSeenSeries,
}));

// Import after mock is set up
import { registerEngagementTools } from './engagement';

// Helper: directly invoke the bucketing logic by importing it through a minimal mock server
// We test the bucketing by calling the tool handler directly via a test double McpServer.
function makeServer() {
  let handler: ((input: unknown) => Promise<unknown>) | null = null;
  return {
    tool: (_name: string, _desc: string, _schema: unknown, fn: (input: unknown) => Promise<unknown>) => {
      handler = fn;
    },
    invoke: (input: unknown) => {
      if (!handler) throw new Error('tool not registered');
      return handler(input);
    },
  };
}

const READ_CTX = { projectId: 'proj-1', organizationId: 'org-1', clientType: 'read' as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('get_user_last_seen_distribution — bucketing', () => {
  it('correctly buckets users into recency segments', async () => {
    mockGetRetentionLastSeenSeries.mockResolvedValue([
      { days: 0, users: 10 },
      { days: 3, users: 20 },
      { days: 7, users: 5 },   // still in 0-7
      { days: 10, users: 8 },  // 8-14
      { days: 14, users: 2 },  // 8-14
      { days: 20, users: 12 }, // 15-30
      { days: 45, users: 6 },  // 31-60
      { days: 90, users: 3 },  // 60+
    ]);

    const server = makeServer() as any;
    registerEngagementTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId }) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.summary.active_last_7_days).toBe(10 + 20 + 5);  // 35
    expect(content.summary.active_8_to_14_days).toBe(8 + 2);       // 10
    expect(content.summary.active_15_to_30_days).toBe(12);
    expect(content.summary.inactive_31_to_60_days).toBe(6);
    expect(content.summary.churned_60_plus_days).toBe(3);
    expect(content.summary.total_identified_users).toBe(66);
  });

  it('returns zero counts when no data', async () => {
    mockGetRetentionLastSeenSeries.mockResolvedValue([]);

    const server = makeServer() as any;
    registerEngagementTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId }) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.summary.total_identified_users).toBe(0);
    expect(content.summary.active_last_7_days).toBe(0);
    expect(content.summary.churned_60_plus_days).toBe(0);
  });

  it('passes raw distribution alongside the summary', async () => {
    const raw = [{ days: 1, users: 5 }];
    mockGetRetentionLastSeenSeries.mockResolvedValue(raw);

    const server = makeServer() as any;
    registerEngagementTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId }) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.distribution).toEqual(raw);
  });
});

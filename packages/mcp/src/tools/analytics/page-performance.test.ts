import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetTopPages = vi.hoisted(() => vi.fn());
const mockGetSettingsForProject = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ timezone: 'UTC' }),
);

vi.mock('@openpanel/db', () => ({
  PagesService: vi.fn().mockImplementation(() => ({
    getTopPages: mockGetTopPages,
  })),
  ch: {},
  getSettingsForProject: mockGetSettingsForProject,
  resolveClientProjectId: vi.fn(({ clientProjectId }: { clientProjectId: string }) => Promise.resolve(clientProjectId)),
}));

import { registerPagePerformanceTools } from './page-performance';

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

/** Re-hydrate the columnar table the tool returns into row objects. */
function rowsOf(result: { columns: string[]; rows: unknown[][] }): any[] {
  return result.rows.map((row) =>
    Object.fromEntries(result.columns.map((column, i) => [column, row[i]])),
  );
}

function makePage(overrides: Record<string, unknown> = {}) {
  return {
    path: '/page',
    title: 'Page',
    sessions: 100,
    pageviews: 200,
    bounce_rate: 50,
    avg_duration: 2,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSettingsForProject.mockResolvedValue({ timezone: 'UTC' });
});

describe('get_page_performance — seo thresholds', () => {
  it('states the classification rules once instead of per row', async () => {
    mockGetTopPages.mockResolvedValue([makePage({ bounce_rate: 80 })]);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId }) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.seo_thresholds).toEqual({
      high_bounce: 'bounce_rate > 70',
      low_engagement: 'avg_duration < 1 (minutes)',
      good_landing_page: 'bounce_rate < 40 AND avg_duration > 2',
    });
  });

  it('returns the raw inputs the thresholds are applied to', async () => {
    mockGetTopPages.mockResolvedValue([
      makePage({ bounce_rate: 80, avg_duration: 0.5 }),
    ]);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId }) as any;
    const content = JSON.parse(result.content[0].text);

    // The booleans were pure functions of these two columns, so the columns
    // are all the reader needs.
    expect(rowsOf(content)[0]).toMatchObject({
      bounce_rate: 80,
      avg_duration: 0.5,
    });
  });
});

describe('get_page_performance — sorting', () => {
  const pages = [
    makePage({ path: '/a', bounce_rate: 20, sessions: 10 }),
    makePage({ path: '/b', bounce_rate: 80, sessions: 50 }),
    makePage({ path: '/c', bounce_rate: 50, sessions: 30 }),
  ];

  it('sorts by sessions descending by default', async () => {
    mockGetTopPages.mockResolvedValue([...pages]);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId }) as any;
    const content = JSON.parse(result.content[0].text);
    const paths = rowsOf(content).map((p) => p.path);

    expect(paths).toEqual(['/b', '/c', '/a']);
  });

  it('sorts by bounce_rate descending', async () => {
    mockGetTopPages.mockResolvedValue([...pages]);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId, sortBy: 'bounce_rate', sortOrder: 'desc' }) as any;
    const content = JSON.parse(result.content[0].text);
    const paths = rowsOf(content).map((p) => p.path);

    expect(paths).toEqual(['/b', '/c', '/a']);
  });

  it('sorts by bounce_rate ascending', async () => {
    mockGetTopPages.mockResolvedValue([...pages]);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId, sortBy: 'bounce_rate', sortOrder: 'asc' }) as any;
    const content = JSON.parse(result.content[0].text);
    const paths = rowsOf(content).map((p) => p.path);

    expect(paths).toEqual(['/a', '/c', '/b']);
  });

  it('respects limit', async () => {
    mockGetTopPages.mockResolvedValue([...pages]);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId, limit: 2 }) as any;
    const content = JSON.parse(result.content[0].text);

    // 2 kept rows plus the "(other)" rollup for the third.
    expect(content.rows).toHaveLength(3);
    expect(content.total_rows).toBe(3);
    expect(content.rows[2][0]).toBe('(other: 1 pages)');
  });
});

describe('get_page_performance — metadata', () => {
  it('reports the true total and rolls the tail up so sessions reconcile', async () => {
    const manyPages = Array.from({ length: 10 }, (_, i) =>
      makePage({ path: `/page-${i}` }),
    );
    mockGetTopPages.mockResolvedValue(manyPages);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId, limit: 5 }) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.total_rows).toBe(10);
    // 5 kept rows plus the rollup.
    expect(content.rows).toHaveLength(6);
    const totalSessions = content.rows.reduce(
      (acc: number, row: unknown[]) => acc + (row[2] as number),
      0,
    );
    expect(totalSessions).toBe(10 * 100);
  });

  it('returns empty pages array when no data', async () => {
    mockGetTopPages.mockResolvedValue([]);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId }) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.rows).toEqual([]);
    expect(content.total_rows).toBe(0);
  });
});

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

describe('get_page_performance — seo_signals annotation', () => {
  it('marks high_bounce when bounce_rate > 70', async () => {
    mockGetTopPages.mockResolvedValue([makePage({ bounce_rate: 80 })]);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId }) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.pages[0].seo_signals.high_bounce).toBe(true);
    expect(content.pages[0].seo_signals.low_engagement).toBe(false);
    expect(content.pages[0].seo_signals.good_landing_page).toBe(false);
  });

  it('does not mark high_bounce when bounce_rate is exactly 70', async () => {
    mockGetTopPages.mockResolvedValue([makePage({ bounce_rate: 70 })]);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId }) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.pages[0].seo_signals.high_bounce).toBe(false);
  });

  it('marks low_engagement when avg_duration < 1', async () => {
    mockGetTopPages.mockResolvedValue([makePage({ avg_duration: 0.5, bounce_rate: 30 })]);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId }) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.pages[0].seo_signals.low_engagement).toBe(true);
  });

  it('marks good_landing_page when bounce_rate < 40 and avg_duration > 2', async () => {
    mockGetTopPages.mockResolvedValue([makePage({ bounce_rate: 25, avg_duration: 3 })]);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId }) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.pages[0].seo_signals.good_landing_page).toBe(true);
    expect(content.pages[0].seo_signals.high_bounce).toBe(false);
    expect(content.pages[0].seo_signals.low_engagement).toBe(false);
  });

  it('does not mark good_landing_page when bounce_rate is exactly 40', async () => {
    mockGetTopPages.mockResolvedValue([makePage({ bounce_rate: 40, avg_duration: 3 })]);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId }) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.pages[0].seo_signals.good_landing_page).toBe(false);
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
    const paths = content.pages.map((p: any) => p.path);

    expect(paths).toEqual(['/b', '/c', '/a']);
  });

  it('sorts by bounce_rate descending', async () => {
    mockGetTopPages.mockResolvedValue([...pages]);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId, sortBy: 'bounce_rate', sortOrder: 'desc' }) as any;
    const content = JSON.parse(result.content[0].text);
    const paths = content.pages.map((p: any) => p.path);

    expect(paths).toEqual(['/b', '/c', '/a']);
  });

  it('sorts by bounce_rate ascending', async () => {
    mockGetTopPages.mockResolvedValue([...pages]);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId, sortBy: 'bounce_rate', sortOrder: 'asc' }) as any;
    const content = JSON.parse(result.content[0].text);
    const paths = content.pages.map((p: any) => p.path);

    expect(paths).toEqual(['/a', '/c', '/b']);
  });

  it('respects limit', async () => {
    mockGetTopPages.mockResolvedValue([...pages]);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId, limit: 2 }) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.pages).toHaveLength(2);
    expect(content.shown).toBe(2);
    expect(content.total_pages).toBe(3);
  });
});

describe('get_page_performance — metadata', () => {
  it('returns total_pages and shown counts', async () => {
    const manyPages = Array.from({ length: 10 }, (_, i) =>
      makePage({ path: `/page-${i}` }),
    );
    mockGetTopPages.mockResolvedValue(manyPages);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId, limit: 5 }) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.total_pages).toBe(10);
    expect(content.shown).toBe(5);
  });

  it('returns empty pages array when no data', async () => {
    mockGetTopPages.mockResolvedValue([]);

    const server = makeServer() as any;
    registerPagePerformanceTools(server, READ_CTX);
    const result = await server.invoke({ projectId: READ_CTX.projectId }) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.pages).toEqual([]);
    expect(content.total_pages).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetPageConversionsCore = vi.hoisted(() => vi.fn());

vi.mock('@openpanel/db', () => ({
  getPageConversionsCore: mockGetPageConversionsCore,
  resolveClientProjectId: vi.fn(({ clientProjectId }: { clientProjectId: string }) =>
    Promise.resolve(clientProjectId),
  ),
}));

import { registerPageConversionTools } from './page-conversions';

function makeServer() {
  let handler: ((input: unknown) => Promise<unknown>) | null = null;
  return {
    tool: (
      _name: string,
      _desc: string,
      _schema: unknown,
      fn: (input: unknown) => Promise<unknown>,
    ) => {
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
    path: '/pricing',
    origin: 'https://example.com',
    unique_converters: 10,
    total_visitors: 200,
    conversion_rate: 5.0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('get_page_conversions — output structure', () => {
  it('returns pages with all required fields', async () => {
    mockGetPageConversionsCore.mockResolvedValue([makePage()]);

    const server = makeServer() as any;
    registerPageConversionTools(server, READ_CTX);
    const result = (await server.invoke({
      projectId: READ_CTX.projectId,
      conversionEvent: 'sign_up',
    })) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.pages[0]).toMatchObject({
      path: '/pricing',
      origin: 'https://example.com',
      unique_converters: 10,
      total_visitors: 200,
      conversion_rate: 5.0,
    });
  });

  it('includes metadata fields in response', async () => {
    mockGetPageConversionsCore.mockResolvedValue([makePage()]);

    const server = makeServer() as any;
    registerPageConversionTools(server, READ_CTX);
    const result = (await server.invoke({
      projectId: READ_CTX.projectId,
      conversionEvent: 'purchase',
    })) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.conversion_event).toBe('purchase');
    expect(content.window_hours).toBe(24);
    expect(content.total_pages).toBe(1);
  });

  it('returns empty pages array when no conversions found', async () => {
    mockGetPageConversionsCore.mockResolvedValue([]);

    const server = makeServer() as any;
    registerPageConversionTools(server, READ_CTX);
    const result = (await server.invoke({
      projectId: READ_CTX.projectId,
      conversionEvent: 'sign_up',
    })) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.pages).toEqual([]);
    expect(content.total_pages).toBe(0);
  });
});

describe('get_page_conversions — arguments forwarding', () => {
  it('passes conversionEvent to core function', async () => {
    mockGetPageConversionsCore.mockResolvedValue([]);

    const server = makeServer() as any;
    registerPageConversionTools(server, READ_CTX);
    await server.invoke({
      projectId: READ_CTX.projectId,
      conversionEvent: 'trial_started',
    });

    expect(mockGetPageConversionsCore).toHaveBeenCalledWith(
      expect.objectContaining({ conversionEvent: 'trial_started' }),
    );
  });

  it('defaults windowHours to 24 when not provided', async () => {
    mockGetPageConversionsCore.mockResolvedValue([]);

    const server = makeServer() as any;
    registerPageConversionTools(server, READ_CTX);
    await server.invoke({
      projectId: READ_CTX.projectId,
      conversionEvent: 'sign_up',
    });

    expect(mockGetPageConversionsCore).toHaveBeenCalledWith(
      expect.objectContaining({ windowHours: 24 }),
    );
  });

  it('passes custom windowHours through', async () => {
    mockGetPageConversionsCore.mockResolvedValue([]);

    const server = makeServer() as any;
    registerPageConversionTools(server, READ_CTX);
    await server.invoke({
      projectId: READ_CTX.projectId,
      conversionEvent: 'sign_up',
      windowHours: 168,
    });

    expect(mockGetPageConversionsCore).toHaveBeenCalledWith(
      expect.objectContaining({ windowHours: 168 }),
    );
    const result = (await server.invoke({
      projectId: READ_CTX.projectId,
      conversionEvent: 'sign_up',
      windowHours: 168,
    })) as any;
    const content = JSON.parse(result.content[0].text);
    expect(content.window_hours).toBe(168);
  });

  it('defaults limit to 50 when not provided', async () => {
    mockGetPageConversionsCore.mockResolvedValue([]);

    const server = makeServer() as any;
    registerPageConversionTools(server, READ_CTX);
    await server.invoke({
      projectId: READ_CTX.projectId,
      conversionEvent: 'sign_up',
    });

    expect(mockGetPageConversionsCore).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
    );
  });

  it('passes projectId from context when not specified', async () => {
    mockGetPageConversionsCore.mockResolvedValue([]);

    const server = makeServer() as any;
    registerPageConversionTools(server, READ_CTX);
    await server.invoke({
      projectId: READ_CTX.projectId,
      conversionEvent: 'sign_up',
    });

    expect(mockGetPageConversionsCore).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj-1' }),
    );
  });
});

describe('get_page_conversions — total_pages count', () => {
  it('reflects the number of pages returned by core', async () => {
    const pages = Array.from({ length: 7 }, (_, i) =>
      makePage({ path: `/page-${i}`, unique_converters: 10 - i }),
    );
    mockGetPageConversionsCore.mockResolvedValue(pages);

    const server = makeServer() as any;
    registerPageConversionTools(server, READ_CTX);
    const result = (await server.invoke({
      projectId: READ_CTX.projectId,
      conversionEvent: 'sign_up',
    })) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.total_pages).toBe(7);
    expect(content.pages).toHaveLength(7);
  });
});

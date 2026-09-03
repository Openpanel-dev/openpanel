import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test';

const mockGetPageConversionsCore = mock();

// Mocked at the specifier the source imports resolve to, not the
// '@openpanel/db' barrel — a whole-barrel replacement would drop every other
// export the barrel carries for any other file sharing this process
// (bun:test only isolates modules per file under `--isolate`; see AGENTS.md).
const actualPagesService = await import(
  '@openpanel/db/src/services/pages.service'
);
mock.module('@openpanel/db/src/services/pages.service', () => ({
  ...actualPagesService,
  getPageConversionsCore: mockGetPageConversionsCore,
}));

const actualProjectService = await import(
  '@openpanel/db/src/services/project.service'
);
mock.module('@openpanel/db/src/services/project.service', () => ({
  ...actualProjectService,
  resolveClientProjectId: mock(
    ({ clientProjectId }: { clientProjectId: string }) =>
      Promise.resolve(clientProjectId)
  ),
}));

let registerPageConversionTools: typeof import('./page-conversions').registerPageConversionTools;

beforeAll(async () => {
  ({ registerPageConversionTools } = await import('./page-conversions'));
});

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

/** Re-hydrate the columnar table the tool returns into row objects. */
function rowsOf(result: { columns: string[]; rows: unknown[][] }): any[] {
  return result.rows.map((row) =>
    Object.fromEntries(result.columns.map((column, i) => [column, row[i]]))
  );
}

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
  mockGetPageConversionsCore.mockReset();
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

    expect(rowsOf(content)[0]).toMatchObject({
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
    expect(content.total_rows).toBe(1);
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

    expect(content.rows).toEqual([]);
    expect(content.total_rows).toBe(0);
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
      expect.objectContaining({ conversionEvent: 'trial_started' })
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
      expect.objectContaining({ windowHours: 24 })
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
      expect.objectContaining({ windowHours: 168 })
    );
    const result = (await server.invoke({
      projectId: READ_CTX.projectId,
      conversionEvent: 'sign_up',
      windowHours: 168,
    })) as any;
    const content = JSON.parse(result.content[0].text);
    expect(content.window_hours).toBe(168);
  });

  it('defaults limit to 25, fetching one extra row to detect a tail', async () => {
    mockGetPageConversionsCore.mockResolvedValue([]);

    const server = makeServer() as any;
    registerPageConversionTools(server, READ_CTX);
    await server.invoke({
      projectId: READ_CTX.projectId,
      conversionEvent: 'sign_up',
    });

    expect(mockGetPageConversionsCore).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 26 })
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
      expect.objectContaining({ projectId: 'proj-1' })
    );
  });
});

describe('get_page_conversions — total_pages count', () => {
  it('reflects the number of pages returned by core', async () => {
    const pages = Array.from({ length: 7 }, (_, i) =>
      makePage({ path: `/page-${i}`, unique_converters: 10 - i })
    );
    mockGetPageConversionsCore.mockResolvedValue(pages);

    const server = makeServer() as any;
    registerPageConversionTools(server, READ_CTX);
    const result = (await server.invoke({
      projectId: READ_CTX.projectId,
      conversionEvent: 'sign_up',
    })) as any;
    const content = JSON.parse(result.content[0].text);

    expect(content.total_rows).toBe(7);
    expect(rowsOf(content)).toHaveLength(7);
  });
});

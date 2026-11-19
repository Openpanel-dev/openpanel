import { afterAll, beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { capturingLogger } from '../../../../../../test/rpc-fixtures';
import type { ServiceDeps } from '../../../../../services';
import type { McpToolDeps } from '../shared';

const getTopPagesCore = mock(async (_deps: unknown, _input: unknown) => [
  {
    path: '/',
    origin: 'https://example.com',
    sessions: 2,
    pageviews: 3,
    revenue: 10,
  },
]);
const getEntryExitPagesCore = mock(async (_deps: unknown, _input: unknown) => [
  {
    path: '/',
    origin: 'https://example.com',
    sessions: 2,
    pageviews: 7,
    revenue: 10,
  },
]);
const actualPagesService = await import('../../../../overview/pages.service');
const realPagesService = { ...actualPagesService };
mock.module('../../../../overview/pages.service', () => ({
  ...realPagesService,
  getTopPagesCore,
  getEntryExitPagesCore,
}));

afterAll(() => {
  mock.module('../../../../overview/pages.service', () => realPagesService);
});

let registerPageTools: typeof import('./pages').registerPageTools;
beforeAll(async () => {
  ({ registerPageTools } = await import('./pages'));
});
beforeEach(() => {
  getTopPagesCore.mockClear();
  getEntryExitPagesCore.mockClear();
});

const TOOLS = {
  context: { projectId: 'project', organizationId: 'org', clientType: 'read' },
  deps: { logger: capturingLogger() } as unknown as ServiceDeps,
} as McpToolDeps;
const INPUT = { startDate: '2026-08-01', endDate: '2026-08-31', limit: 1 };
interface PageResult {
  mode?: string;
  columns: string[];
  rows: unknown[][];
  total_rows: number;
  note?: string;
  metric_definitions?: { pageviews: string };
}

/** Exercise the serialized MCP response while retaining tool discovery text. */
function makeServer() {
  const tools = new Map<
    string,
    {
      description: string;
      handler: (
        input: unknown
      ) => Promise<{ content: { text: string }[]; isError?: boolean }>;
    }
  >();
  const server = {
    tool(
      name: string,
      description: string,
      _schema: unknown,
      handler: (
        input: unknown
      ) => Promise<{ content: { text: string }[]; isError?: boolean }>
    ) {
      tools.set(name, { description, handler });
    },
    description(name: string) {
      return tools.get(name)?.description;
    },
    async invoke(name: string, input: unknown): Promise<PageResult> {
      const tool = tools.get(name);
      if (!tool) {
        throw new Error(`Missing tool: ${name}`);
      }
      const result = await tool.handler(input);
      if (result.isError) {
        throw new Error(result.content[0]?.text ?? 'MCP tool failed');
      }
      return JSON.parse(result.content[0]!.text) as PageResult;
    },
  };
  return server;
}

test.each([
  'entry',
  'exit',
])('%s pageviews are explicitly session-wide without renaming the legacy column', async (mode) => {
  const server = makeServer();
  registerPageTools(server as unknown as McpServer, TOOLS);
  const perPath = await server.invoke('get_top_pages', INPUT);
  const perSession = await server.invoke('get_entry_exit_pages', {
    ...INPUT,
    mode,
  });
  expect(getTopPagesCore).toHaveBeenCalledWith(TOOLS.deps, {
    projectId: 'project',
    startDate: INPUT.startDate,
    endDate: INPUT.endDate,
    limit: 2,
  });
  expect(getEntryExitPagesCore).toHaveBeenCalledWith(TOOLS.deps, {
    projectId: 'project',
    startDate: INPUT.startDate,
    endDate: INPUT.endDate,
    limit: 2,
    mode,
  });
  expect(perPath).toEqual({
    columns: ['path', 'origin', 'sessions', 'pageviews', 'revenue'],
    rows: [['/', 'https://example.com', 2, 3, 10]],
    total_rows: 1,
  });
  expect(perSession).toMatchObject({
    mode,
    columns: perPath.columns,
    rows: [['/', 'https://example.com', 2, 7, 10]],
    total_rows: 1,
  });
  expect(perSession.metric_definitions?.pageviews).toContain('entire sessions');
  expect(perSession.metric_definitions?.pageviews).toContain('other pages');
  expect(perSession.metric_definitions?.pageviews).toContain(
    'get_page_performance'
  );
  expect(server.description('get_entry_exit_pages')).toContain(
    perSession.metric_definitions!.pageviews
  );
});

test('empty entry results still explain the pageviews scope', async () => {
  getEntryExitPagesCore.mockResolvedValueOnce([]);
  const server = makeServer();
  registerPageTools(server as unknown as McpServer, TOOLS);
  const result = await server.invoke('get_entry_exit_pages', {
    ...INPUT,
    mode: 'entry',
  });
  expect(getEntryExitPagesCore).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({
    mode: 'entry',
    columns: ['path', 'origin', 'sessions', 'pageviews'],
    rows: [],
    total_rows: 0,
  });
  expect(result.metric_definitions?.pageviews).toContain('entire sessions');
});

test('metric clarification preserves the capped-query pagination note', async () => {
  getEntryExitPagesCore.mockResolvedValueOnce([
    {
      path: '/',
      origin: 'https://example.com',
      sessions: 2,
      pageviews: 7,
      revenue: 10,
    },
    {
      path: '/next',
      origin: 'https://example.com',
      sessions: 1,
      pageviews: 4,
      revenue: 0,
    },
  ]);
  const server = makeServer();
  registerPageTools(server as unknown as McpServer, TOOLS);
  const result = await server.invoke('get_entry_exit_pages', {
    ...INPUT,
    mode: 'exit',
  });
  expect(getEntryExitPagesCore).toHaveBeenCalledTimes(1);
  expect(result.rows).toEqual([['/', 'https://example.com', 2, 7, 10]]);
  expect(result.total_rows).toBe(1);
  expect(result.note).toContain('capped query');
  expect(result.metric_definitions?.pageviews).toContain('entire sessions');
});

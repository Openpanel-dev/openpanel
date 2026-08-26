import { getTrafficBreakdownCore, type TrafficColumn } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveDateRange,
  resolveProjectId,
  table,
  withErrorHandling,
  zDateRange,
  zLimit,
} from '../shared';

const DEFAULT_BREAKDOWN_LIMIT = 25;
const MAX_BREAKDOWN_LIMIT = 500;

/** Rows come back as `{ prefix?, name, sessions, pageviews, revenue? }`. */
type BreakdownRow = {
  prefix?: string;
  name: string | null;
  sessions: number;
  pageviews: number;
  revenue?: number;
};

/**
 * Every breakdown here is a ranked long-tail distribution: on openpanel.dev
 * `referrer_name` returns 740 rows where the top 10 are 91% of sessions and 596
 * rows have two sessions or fewer. Returning the whole tail costs ~23k tokens to
 * say nothing, so we keep the head and roll the rest into one `(other)` row —
 * which keeps the totals correct, unlike a plain truncation.
 */
function breakdownTable(rows: BreakdownRow[], limit: number, unit: string) {
  const hasPrefix = rows.some((row) => row.prefix !== undefined);
  const hasRevenue = rows.some((row) => row.revenue !== undefined);
  const columns: (keyof BreakdownRow & string)[] = [
    'name',
    ...(hasPrefix ? (['prefix'] as const) : []),
    'sessions',
    'pageviews',
    ...(hasRevenue ? (['revenue'] as const) : []),
  ];

  return table(rows, {
    limit,
    columns,
    sum: ['sessions', 'pageviews', ...(hasRevenue ? (['revenue'] as const) : [])],
    sortedBy: 'sessions',
    unit,
  });
}

export function registerTrafficTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'get_top_referrers',
    `Get the top traffic sources driving visitors to the site, broken down by referrer name and type. Returns the top ${DEFAULT_BREAKDOWN_LIMIT} sources by sessions; the long tail is aggregated into a trailing "(other)" row so totals still add up. A null name means direct traffic.`,
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      breakdown: z
        .enum(['referrer_name', 'referrer_type', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign'])
        .default('referrer_name')
        .optional()
        .describe(
          'How to group referrers: by name (Google, Twitter), type (search, social), full URL, or UTM params',
        ),
      limit: zLimit(DEFAULT_BREAKDOWN_LIMIT, MAX_BREAKDOWN_LIMIT),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, breakdown, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const rows = await getTrafficBreakdownCore({
          projectId,
          startDate,
          endDate,
          column: (breakdown ?? 'referrer_name') as TrafficColumn,
        });
        return breakdownTable(
          rows as BreakdownRow[],
          limit ?? DEFAULT_BREAKDOWN_LIMIT,
          'sources',
        );
      }),
  );

  server.tool(
    'get_country_breakdown',
    `Get visitor counts broken down by country, region, or city. Returns the top ${DEFAULT_BREAKDOWN_LIMIT} by sessions with the tail aggregated into a trailing "(other)" row.`,
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      breakdown: z
        .enum(['country', 'region', 'city'])
        .default('country')
        .optional()
        .describe('Geographic grouping level (default: country)'),
      limit: zLimit(DEFAULT_BREAKDOWN_LIMIT, MAX_BREAKDOWN_LIMIT),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, breakdown, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const rows = await getTrafficBreakdownCore({
          projectId,
          startDate,
          endDate,
          column: (breakdown ?? 'country') as TrafficColumn,
        });
        return breakdownTable(
          rows as BreakdownRow[],
          limit ?? DEFAULT_BREAKDOWN_LIMIT,
          'locations',
        );
      }),
  );

  server.tool(
    'get_device_breakdown',
    'Get visitor counts broken down by device type, browser, or operating system.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      breakdown: z
        .enum(['device', 'browser', 'os'])
        .default('device')
        .optional()
        .describe(
          'Device dimension: "device" (desktop/mobile/tablet), "browser" (Chrome/Firefox), or "os" (Windows/macOS)',
        ),
      limit: zLimit(DEFAULT_BREAKDOWN_LIMIT, MAX_BREAKDOWN_LIMIT),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, breakdown, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        const rows = await getTrafficBreakdownCore({
          projectId,
          startDate,
          endDate,
          column: (breakdown ?? 'device') as TrafficColumn,
        });
        return breakdownTable(
          rows as BreakdownRow[],
          limit ?? DEFAULT_BREAKDOWN_LIMIT,
          'devices',
        );
      }),
  );
}

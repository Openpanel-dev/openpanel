import { getTrafficBreakdownCore, type TrafficColumn } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveDateRange,
  
  withErrorHandling,
  zDateRange,
  resolveProjectId
} from '../shared';

export function registerTrafficTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'get_top_referrers',
    'Get the top traffic sources driving visitors to the site, broken down by referrer name and type.',
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
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, breakdown }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        return getTrafficBreakdownCore({
          projectId,
          startDate,
          endDate,
          column: (breakdown ?? 'referrer_name') as TrafficColumn,
        });
      }),
  );

  server.tool(
    'get_country_breakdown',
    'Get visitor counts broken down by country, region, or city.',
    {
      projectId: projectIdSchema(context),
      ...zDateRange,
      breakdown: z
        .enum(['country', 'region', 'city'])
        .default('country')
        .optional()
        .describe('Geographic grouping level (default: country)'),
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, breakdown }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        return getTrafficBreakdownCore({
          projectId,
          startDate,
          endDate,
          column: (breakdown ?? 'country') as TrafficColumn,
        });
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
    },
    async ({ projectId: inputProjectId, startDate: sd, endDate: ed, breakdown }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const { startDate, endDate } = resolveDateRange(sd, ed);
        return getTrafficBreakdownCore({
          projectId,
          startDate,
          endDate,
          column: (breakdown ?? 'device') as TrafficColumn,
        });
      }),
  );
}

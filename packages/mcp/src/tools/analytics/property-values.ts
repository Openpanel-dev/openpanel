import { EVENT_COLUMNS, TABLE_NAMES, ch, clix } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  
  withErrorHandling,
  resolveProjectId
} from '../shared';

export function registerPropertyValueTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'list_event_properties',
    'List fields available for filtering or breaking down events. Returns `columns` (top-level event columns like `path`, `country`, `device` — use the bare name in filters) and `properties` (custom JSON keys — use prefixed as `properties.<key>` in filters). Use this to discover what data is available before filtering or breaking down.',
    {
      projectId: projectIdSchema(context),
      eventName: z
        .string()
        .optional()
        .describe('Filter to a specific event name. Omit to list properties across all events.'),
    },
    async ({ projectId: inputProjectId, eventName }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        // GROUP BY rather than DISTINCT so the epv_keys projection can serve
        // this (a multi-column DISTINCT cannot be matched against an
        // aggregating projection); `name` tie-breaks the ORDER BY so the
        // LIMIT window is deterministic. See listEventPropertiesCore.
        const builder = clix(ch)
          .select<{ property_key: string; event_name: string }>([
            'property_key',
            'name as event_name',
          ])
          .from(TABLE_NAMES.event_property_values_mv)
          .where('project_id', '=', projectId)
          .groupBy(['property_key', 'name'])
          .orderBy('property_key', 'ASC')
          .orderBy('name', 'ASC')
          .limit(500);

        if (eventName) {
          builder.where('name', '=', eventName);
        }

        const rows = await builder.execute();
        return { columns: EVENT_COLUMNS, properties: rows };
      }),
  );

  server.tool(
    'get_event_property_values',
    'Get all distinct values for a specific event property. Use this to understand what values exist before filtering (e.g. what plans exist in "plan" property, what countries, what status values).',
    {
      projectId: projectIdSchema(context),
      eventName: z
        .string()
        .describe('The event name to look up property values for (e.g. "subscription_created")'),
      propertyKey: z
        .string()
        .describe('The property key to get values for (e.g. "plan", "country", "status")'),
    },
    async ({ projectId: inputProjectId, eventName, propertyKey }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const rows = await clix(ch)
          .select<{ value: string }>(['property_value as value'])
          .from(TABLE_NAMES.event_property_values_mv)
          .where('project_id', '=', projectId)
          .where('name', '=', eventName)
          .where('property_key', '=', propertyKey)
          .orderBy('created_at', 'DESC')
          .limit(200)
          .execute();

        return {
          event: eventName,
          property: propertyKey,
          values: rows.map((r) => r.value),
        };
      }),
  );
}

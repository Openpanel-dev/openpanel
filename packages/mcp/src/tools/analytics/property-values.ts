import { EVENT_COLUMNS, TABLE_NAMES, ch, clix } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveProjectId,
  withErrorHandling,
  zLimit,
} from '../shared';

const DEFAULT_PROPERTY_LIMIT = 50;
const MAX_PROPERTY_LIMIT = 500;
const DEFAULT_VALUE_LIMIT = 50;
const MAX_VALUE_LIMIT = 500;

/**
 * Collapse the raw property-key rows into a discovery list.
 *
 * The raw rows are ordered alphabetically and capped at 500, which is the worst
 * possible shape for this: a single property with dynamic sub-paths (`__query`,
 * `data`) explodes into hundreds of `__query.<uuid>` rows that sort first and
 * push real properties like `country` off the end. Collapsing to the root
 * segment and ranking by how many sub-keys fall under it turns 500 near-useless
 * rows into a few dozen useful ones.
 *
 * The in-app chat agent solves the same problem in
 * `apps/api/src/agents/tools/helpers.ts`; kept as a local copy rather than a
 * shared abstraction since the two consumers may want to diverge.
 */
function compactPropertyKeys(
  rows: Array<{ property_key: string }>,
  max: number,
): { properties: string[]; total: number; note?: string } {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const dot = row.property_key.indexOf('.');
    const root = dot >= 0 ? row.property_key.slice(0, dot) : row.property_key;
    counts.set(root, (counts.get(root) ?? 0) + 1);
  }

  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key);

  if (sorted.length <= max) {
    return { properties: sorted, total: sorted.length };
  }
  return {
    properties: sorted.slice(0, max),
    total: sorted.length,
    note: `Showing the ${max} most prominent of ${sorted.length} property roots. Raise \`limit\` to see the rest.`,
  };
}

export function registerPropertyValueTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'list_event_properties',
    'List fields available for filtering or breaking down events. Returns `columns` (top-level event columns like `path`, `country`, `device` — use the bare name in filters) and `properties` (custom JSON keys — use prefixed as `properties.<key>` in filters). Dotted sub-keys are rolled up to their root and ranked by prominence, so `properties.__query.utm_source` appears as `__query`; you can still filter on the exact full key. Use this to discover what data is available before filtering or breaking down.',
    {
      projectId: projectIdSchema(context),
      eventName: z
        .string()
        .optional()
        .describe('Filter to a specific event name. Omit to list properties across all events.'),
      limit: zLimit(DEFAULT_PROPERTY_LIMIT, MAX_PROPERTY_LIMIT),
    },
    async ({ projectId: inputProjectId, eventName, limit }) =>
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
        return {
          ...(eventName ? { event_name: eventName } : {}),
          columns: EVENT_COLUMNS,
          ...compactPropertyKeys(rows, limit ?? DEFAULT_PROPERTY_LIMIT),
        };
      }),
  );

  server.tool(
    'get_event_property_values',
    `Get the distinct values seen for a specific event property, most recent first. Use this to understand what values exist before filtering (e.g. what plans exist in "plan" property, what countries, what status values). Returns up to ${DEFAULT_VALUE_LIMIT} distinct values by default.`,
    {
      projectId: projectIdSchema(context),
      eventName: z
        .string()
        .describe('The event name to look up property values for (e.g. "subscription_created")'),
      propertyKey: z
        .string()
        .describe('The property key to get values for (e.g. "plan", "country", "status")'),
      limit: zLimit(DEFAULT_VALUE_LIMIT, MAX_VALUE_LIMIT),
    },
    async ({ projectId: inputProjectId, eventName, propertyKey, limit }) =>
      withErrorHandling(async () => {
        const projectId = await resolveProjectId(context, inputProjectId);
        const take = limit ?? DEFAULT_VALUE_LIMIT;
        // The MV holds one row per (property, value, day), so the same value
        // recurs across the window — dedupe before counting against the limit,
        // otherwise a single stable value can fill the whole response.
        const rows = await clix(ch)
          .select<{ value: string }>(['property_value as value'])
          .from(TABLE_NAMES.event_property_values_mv)
          .where('project_id', '=', projectId)
          .where('name', '=', eventName)
          .where('property_key', '=', propertyKey)
          .orderBy('created_at', 'DESC')
          .limit(2000)
          .execute();

        const distinct: string[] = [];
        const seen = new Set<string>();
        for (const row of rows) {
          if (seen.has(row.value)) continue;
          seen.add(row.value);
          distinct.push(row.value);
        }

        return {
          event: eventName,
          property: propertyKey,
          values: distinct.slice(0, take),
          total_distinct: distinct.length,
          ...(distinct.length > take
            ? {
                note: `Showing ${take} of ${distinct.length} distinct values. This property is high-cardinality — it is a poor breakdown dimension. Raise \`limit\` if you need more.`,
              }
            : {}),
        };
      }),
  );
}

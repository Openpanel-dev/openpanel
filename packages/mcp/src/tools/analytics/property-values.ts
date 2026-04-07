import { TABLE_NAMES, ch, clix } from '@openpanel/db';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { McpAuthContext } from '../../auth';
import {
  projectIdSchema,
  resolveProjectId,
  withErrorHandling,
} from '../shared';

export async function listEventPropertiesCore(input: {
  projectId: string;
  eventName?: string;
}): Promise<{ properties: Array<{ property_key: string; event_name: string }> }> {
  const builder = clix(ch)
    .select<{ property_key: string; event_name: string }>([
      'distinct property_key',
      'name as event_name',
    ])
    .from(TABLE_NAMES.event_property_values_mv)
    .where('project_id', '=', input.projectId)
    .orderBy('property_key', 'ASC')
    .limit(500);

  if (input.eventName) {
    builder.where('name', '=', input.eventName);
  }

  const rows = await builder.execute();
  return { properties: rows };
}

export async function getEventPropertyValuesCore(input: {
  projectId: string;
  eventName: string;
  propertyKey: string;
}): Promise<{ event: string; property: string; values: string[] }> {
  const rows = await clix(ch)
    .select<{ value: string }>(['property_value as value'])
    .from(TABLE_NAMES.event_property_values_mv)
    .where('project_id', '=', input.projectId)
    .where('name', '=', input.eventName)
    .where('property_key', '=', input.propertyKey)
    .orderBy('created_at', 'DESC')
    .limit(200)
    .execute();

  return {
    event: input.eventName,
    property: input.propertyKey,
    values: rows.map((r) => r.value),
  };
}

export function registerPropertyValueTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'list_event_properties',
    'List all property keys that have been tracked for a specific event (or across all events). Use this to discover what data is available before filtering or breaking down by a property.',
    {
      projectId: projectIdSchema(context),
      eventName: z
        .string()
        .optional()
        .describe('Filter to a specific event name. Omit to list properties across all events.'),
    },
    async ({ projectId: inputProjectId, eventName }) =>
      withErrorHandling(async () => {
        const projectId = resolveProjectId(context, inputProjectId);
        const builder = clix(ch)
          .select<{ property_key: string; event_name: string }>([
            'distinct property_key',
            'name as event_name',
          ])
          .from(TABLE_NAMES.event_property_values_mv)
          .where('project_id', '=', projectId)
          .orderBy('property_key', 'ASC')
          .limit(500);

        if (eventName) {
          builder.where('name', '=', eventName);
        }

        const rows = await builder.execute();
        return { properties: rows };
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
        const projectId = resolveProjectId(context, inputProjectId);
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

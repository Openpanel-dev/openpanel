import sqlstring from 'sqlstring';
import type { ICustomEventDefinition } from '@openpanel/validation';
import { TABLE_NAMES } from '../clickhouse/client';
import { db } from '../prisma-client';
import { getEventFiltersWhereClause } from './chart.service';

/**
 * Check if an event name is a custom event
 */
export async function getCustomEventByName(
  name: string,
  projectId: string,
) {
  return db.customEvent.findUnique({
    where: {
      name_projectId: {
        name,
        projectId,
      },
    },
  });
}

/**
 * Get all custom events for a project
 */
export async function getCustomEventsByProject(projectId: string) {
  return db.customEvent.findMany({
    where: { projectId },
  });
}

/**
 * Build SQL fragment for a single source event in custom event
 * Returns SELECT statement that can be used in UNION
 */
function buildCustomEventSourceQuery(
  projectId: string,
  customEventName: string,
  sourceEvent: { name: string; filters?: any[] },
  baseWhere: string[], // Additional WHERE conditions from outer query
): string {
  const whereClauses = [
    `project_id = ${sqlstring.escape(projectId)}`,
    `name = ${sqlstring.escape(sourceEvent.name)}`,
    ...baseWhere,
  ];

  // Add event property filters if present
  if (sourceEvent.filters && sourceEvent.filters.length > 0) {
    const filterWhere = getEventFiltersWhereClause(
      sourceEvent.filters,
      projectId,
    );
    whereClauses.push(...Object.values(filterWhere));
  }

  // Use ClickHouse REPLACE to replace the name column with custom event name
  return `
    SELECT * REPLACE(${sqlstring.escape(customEventName)} AS name)
    FROM ${TABLE_NAMES.events}
    WHERE ${whereClauses.join(' AND ')}
  `;
}

/**
 * Expand a custom event into SQL UNION of source events
 * This creates a CTE that can be used in place of the events table
 *
 * @param customEvent - The custom event definition
 * @param baseWhere - Base WHERE conditions to apply to all source events (date ranges, etc)
 * @returns SQL query string that selects from all source events
 */
export function expandCustomEventToSQL(
  customEvent: {
    name: string;
    projectId: string;
    definition: ICustomEventDefinition;
  },
  baseWhere: string[] = [],
): string {
  const definition = customEvent.definition;

  const sourceQueries = definition.events.map((sourceEvent) =>
    buildCustomEventSourceQuery(
      customEvent.projectId,
      customEvent.name,
      sourceEvent,
      baseWhere,
    ),
  );

  // UNION ALL for OR logic (match any source event)
  return sourceQueries.join(' UNION ALL ');
}

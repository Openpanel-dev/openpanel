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
 * Expand a custom event into SQL query
 *
 * PERFORMANCE OPTIMIZATION:
 * When all source events have no filters, we use a single SELECT with IN clause
 * instead of UNION ALL. This reduces N table scans to 1 table scan.
 *
 * Example:
 * - Before: 20 separate SELECTs with UNION ALL (20 table scans)
 * - After: 1 SELECT with IN ('event1', 'event2', ..., 'event20') (1 table scan)
 *
 * For events with filters, we fall back to UNION ALL to ensure correct filtering.
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

  // Check if we can use the optimized path
  // Optimization is only safe when all events have no filters
  const canOptimize = definition.events.every(
    (event) => !event.filters || event.filters.length === 0
  );

  if (canOptimize && definition.events.length > 0) {
    // OPTIMIZED PATH: Single SELECT with IN clause
    // This reduces N table scans to 1 table scan, dramatically improving performance
    const eventNames = definition.events.map((e) => sqlstring.escape(e.name));

    const whereClauses = [
      `project_id = ${sqlstring.escape(customEvent.projectId)}`,
      `name IN (${eventNames.join(', ')})`,
      ...baseWhere,
    ];

    return `
      SELECT * REPLACE(${sqlstring.escape(customEvent.name)} AS name)
      FROM ${TABLE_NAMES.events}
      WHERE ${whereClauses.join(' AND ')}
    `;
  }

  // FALLBACK PATH: UNION ALL for events with filters
  // When events have filters, each event may need different WHERE conditions,
  // so we must use UNION ALL to apply filters correctly per event
  const sourceQueries = definition.events.map((sourceEvent) =>
    buildCustomEventSourceQuery(
      customEvent.projectId,
      customEvent.name,
      sourceEvent,
      baseWhere,
    ),
  );

  return sourceQueries.join(' UNION ALL ');
}

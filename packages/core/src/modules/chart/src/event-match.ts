import { type SqlFragment, sql } from '@openpanel/db/src/clickhouse/sql';
import type { IChartEvent } from '../../report/report.constants';
import { getEventFiltersWhereClause } from './filter-where';

type MatchableEvent = Pick<IChartEvent, 'name' | 'anyOf'>;

/** The event names a series reads; `['*']` for every event. */
export function eventNamesOf(event: MatchableEvent): string[] {
  if (event.anyOf?.length) {
    return [...new Set(event.anyOf.map((item) => item.name))];
  }
  return [event.name];
}

/**
 * The WHERE condition selecting a series' events, or null for every event.
 * ClickHouse prunes with the `name` bloom index through the OR, so a custom
 * event needs no extra `name IN (...)` guard.
 */
export function eventMatchCondition(
  event: MatchableEvent,
  projectId: string,
  eventsAlias?: string
): SqlFragment | null {
  const nameColumn = sql.id(eventsAlias ? `${eventsAlias}.name` : 'name');
  if (!event.anyOf?.length) {
    return event.name === '*'
      ? null
      : sql`${nameColumn} = ${sql.string(event.name)}`;
  }

  const unfilteredNames = event.anyOf
    .filter((item) => item.filters.length === 0)
    .map((item) => item.name);
  const alternatives = event.anyOf
    .filter((item) => item.filters.length > 0)
    .map((item) => {
      const filters = Object.values(
        getEventFiltersWhereClause(item.filters, projectId, eventsAlias)
      );
      return sql`(${sql.join(
        [sql`${nameColumn} = ${sql.string(item.name)}`, ...filters],
        ' AND '
      )})`;
    });
  if (unfilteredNames.length > 0) {
    alternatives.unshift(
      sql`${nameColumn} IN ${sql.array('String', unfilteredNames)}`
    );
  }
  const [first, ...rest] = alternatives;
  if (first && rest.length === 0) {
    return first;
  }
  return sql`(${sql.join(alternatives, ' OR ')})`;
}

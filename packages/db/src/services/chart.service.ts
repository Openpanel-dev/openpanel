import type { IChartEventFilter, IGetChartDataInput } from '@openpanel/validation';

import { formatClickhouseDate } from '../clickhouse-client';
import type { SqlBuilderObject } from '../sql-builder';
import { createSqlBuilder } from '../sql-builder';

function log(sql: string) {
  const logs = ['--- START', sql, '--- END'];
  console.log(logs.join('\n'));
  return sql;
}

export function getChartSql({
  event,
  breakdowns,
  interval,
  startDate,
  endDate,
  projectId,
}: IGetChartDataInput) {
  const { sb, join, getWhere, getFrom, getSelect, getOrderBy, getGroupBy } =
    createSqlBuilder();

  sb.where = getEventFiltersWhereClause(event.filters);
  sb.where.projectId = `project_id = '${projectId}'`;
  if (event.name !== '*') {
    sb.select.label = `'${event.name}' as label`;
    sb.where.eventName = `name = '${event.name}'`;
  }

  sb.select.count = `count(*) as count`;
  switch (interval) {
    case 'minute': {
      sb.select.date = `toStartOfMinute(created_at) as date`;
      break;
    }
    case 'hour': {
      sb.select.date = `toStartOfHour(created_at) as date`;
      break;
    }
    case 'day': {
      sb.select.date = `toStartOfDay(created_at) as date`;
      break;
    }
    case 'month': {
      sb.select.date = `toStartOfMonth(created_at) as date`;
      break;
    }
  }
  sb.groupBy.date = 'date';
  sb.orderBy.date = 'date ASC';

  if (startDate) {
    sb.where.startDate = `created_at >= '${formatClickhouseDate(startDate)}'`;
  }

  if (endDate) {
    sb.where.endDate = `created_at <= '${formatClickhouseDate(endDate)}'`;
  }

  const breakdown = breakdowns[0]!;
  if (breakdown) {
    const value = breakdown.name.startsWith('properties.')
      ? `mapValues(mapExtractKeyLike(properties, '${breakdown.name
          .replace(/^properties\./, '')
          .replace('.*.', '.%.')}'))`
      : breakdown.name;
    sb.select.label = breakdown.name.startsWith('properties.')
      ? `arrayElement(${value}, 1) as label`
      : `${breakdown.name} as label`;
    sb.groupBy.label = `label`;
  }

  if (event.segment === 'user') {
    sb.select.count = `countDistinct(profile_id) as count`;
  }

  if (event.segment === 'session') {
    sb.select.count = `countDistinct(session_id) as count`;
  }

  if (event.segment === 'user_average') {
    sb.select.count = `COUNT(*)::float / COUNT(DISTINCT profile_id)::float as count`;
  }

  if (event.segment === 'property_sum' && event.property) {
    sb.select.count = `sum(${event.property}) as count`;
  }

  if (event.segment === 'property_average' && event.property) {
    sb.select.count = `avg(${event.property}) as count`;
  }

  if (event.segment === 'one_event_per_user') {
    sb.from = `(
      SELECT DISTINCT ON (profile_id) * from events WHERE ${join(
        sb.where,
        ' AND '
      )}
        ORDER BY profile_id, created_at DESC
      ) as subQuery`;

    return log(`${getSelect()} ${getFrom()} ${getGroupBy()} ${getOrderBy()}`);
  }

  return log(
    `${getSelect()} ${getFrom()} ${getWhere()} ${getGroupBy()} ${getOrderBy()}`
  );
}

export function getEventFiltersWhereClause(filters: IChartEventFilter[]) {
  const where: Record<string, string> = {};
  filters.forEach((filter, index) => {
    const id = `f${index}`;
    const { name, value, operator } = filter;

    if (value.length === 0) return;

    if (name.startsWith('properties.')) {
      const whereFrom = `mapValues(mapExtractKeyLike(properties, '${name
        .replace(/^properties\./, '')
        .replace('.*.', '.%.')}'))`;

      switch (operator) {
        case 'is': {
          where[id] = `arrayExists(x -> ${value
            .map((val) => `x = '${String(val).trim()}'`)
            .join(' OR ')}, ${whereFrom})`;
          break;
        }
        case 'isNot': {
          where[id] = `arrayExists(x -> ${value
            .map((val) => `x != '${String(val).trim()}'`)
            .join(' OR ')}, ${whereFrom})`;
          break;
        }
        case 'contains': {
          where[id] = `arrayExists(x -> ${value
            .map((val) => `x LIKE '%${String(val).trim()}%'`)
            .join(' OR ')}, ${whereFrom})`;
          break;
        }
        case 'doesNotContain': {
          where[id] = `arrayExists(x -> ${value
            .map((val) => `x NOT LIKE '%${String(val).trim()}%'`)
            .join(' OR ')}, ${whereFrom})`;
          break;
        }
      }
    } else {
      switch (operator) {
        case 'is': {
          where[id] = `${name} IN (${value
            .map((val) => `'${String(val).trim()}'`)
            .join(', ')})`;
          break;
        }
        case 'isNot': {
          where[id] = `${name} NOT IN (${value
            .map((val) => `'${String(val).trim()}'`)
            .join(', ')})`;
          break;
        }
        case 'contains': {
          where[id] = value
            .map((val) => `${name} LIKE '%${String(val).trim()}%'`)
            .join(' OR ');
          break;
        }
        case 'doesNotContain': {
          where[id] = value
            .map((val) => `${name} NOT LIKE '%${String(val).trim()}%'`)
            .join(' OR ');
          break;
        }
      }
    }
  });

  return where;
}

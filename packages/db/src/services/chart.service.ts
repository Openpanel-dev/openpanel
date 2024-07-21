import { escape } from 'sqlstring';

import { getTimezoneFromDateString } from '@openpanel/common';
import type {
  IChartEventFilter,
  IGetChartDataInput,
} from '@openpanel/validation';

import { formatClickhouseDate, TABLE_NAMES } from '../clickhouse-client';
import { createSqlBuilder } from '../sql-builder';

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
  sb.where.projectId = `project_id = ${escape(projectId)}`;

  if (event.name !== '*') {
    sb.select.label_0 = `${escape(event.name)} as label_0`;
    sb.where.eventName = `name = ${escape(event.name)}`;
  } else {
    sb.select.label_0 = `'*' as label_0`;
  }

  sb.select.count = `count(*) as count`;
  switch (interval) {
    case 'minute': {
      sb.select.date = `toStartOfMinute(toTimeZone(created_at, '${getTimezoneFromDateString(startDate)}')) as date`;
      break;
    }
    case 'hour': {
      sb.select.date = `toStartOfHour(toTimeZone(created_at, '${getTimezoneFromDateString(startDate)}')) as date`;
      break;
    }
    case 'day': {
      sb.select.date = `toStartOfDay(toTimeZone(created_at, '${getTimezoneFromDateString(startDate)}')) as date`;
      break;
    }
    case 'month': {
      sb.select.date = `toStartOfMonth(toTimeZone(created_at, '${getTimezoneFromDateString(startDate)}')) as date`;
      break;
    }
  }
  sb.groupBy.date = 'date';

  if (startDate) {
    sb.where.startDate = `created_at >= '${formatClickhouseDate(startDate)}'`;
  }

  if (endDate) {
    sb.where.endDate = `created_at <= '${formatClickhouseDate(endDate)}'`;
  }

  breakdowns.forEach((breakdown, index) => {
    const key = `label_${index}`;
    const value = breakdown.name.startsWith('properties.')
      ? `arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, ${escape(
          breakdown.name.replace(/^properties\./, '').replace('.*.', '.%.')
        )})))`
      : escape(breakdown.name);
    sb.select[key] = breakdown.name.startsWith('properties.')
      ? `arrayElement(${value}, 1) as ${key}`
      : `${breakdown.name} as ${key}`;
    sb.groupBy[key] = `${key}`;
  });

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
      SELECT DISTINCT ON (profile_id) * from ${TABLE_NAMES.events} WHERE ${join(
        sb.where,
        ' AND '
      )}
        ORDER BY profile_id, created_at DESC
      ) as subQuery`;

    return `${getSelect()} ${getFrom()} ${getGroupBy()} ${getOrderBy()}`;
  }

  return `${getSelect()} ${getFrom()} ${getWhere()} ${getGroupBy()} ${getOrderBy()}`;
}

export function getEventFiltersWhereClause(filters: IChartEventFilter[]) {
  const where: Record<string, string> = {};
  filters.forEach((filter, index) => {
    const id = `f${index}`;
    const { name, value, operator } = filter;

    if (value.length === 0) return;

    if (name === 'has_profile') {
      if (value.includes('true')) {
        where[id] = `profile_id != device_id`;
      } else {
        where[id] = `profile_id = device_id`;
      }
      return;
    }

    if (name.startsWith('properties.')) {
      const propertyKey = name
        .replace(/^properties\./, '')
        .replace('.*.', '.%.');
      const isWildcard = propertyKey.includes('%');
      const whereFrom = `arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, ${escape(
        name.replace(/^properties\./, '').replace('.*.', '.%.')
      )})))`;

      switch (operator) {
        case 'is': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `x = ${escape(String(val).trim())}`)
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `properties['${propertyKey}'] IN (${value
              .map((val) => escape(String(val).trim()))
              .join(', ')})`;
          }
          break;
        }
        case 'isNot': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `x != ${escape(String(val).trim())}`)
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `properties['${propertyKey}'] NOT IN (${value
              .map((val) => escape(String(val).trim()))
              .join(', ')})`;
          }
          break;
        }
        case 'contains': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `x LIKE ${escape(`%${String(val).trim()}%`)}`)
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = value
              .map(
                (val) =>
                  `properties['${propertyKey}'] LIKE ${escape(`%${String(val).trim()}%`)}`
              )
              .join(' OR ');
          }
          break;
        }
        case 'doesNotContain': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `x NOT LIKE ${escape(`%${String(val).trim()}%`)}`)
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = value
              .map(
                (val) =>
                  `properties['${propertyKey}'] NOT LIKE ${escape(`%${String(val).trim()}%`)}`
              )
              .join(' OR ');
          }
          break;
        }
      }
    } else {
      switch (operator) {
        case 'is': {
          where[id] = `${name} IN (${value
            .map((val) => escape(String(val).trim()))
            .join(', ')})`;
          break;
        }
        case 'isNot': {
          where[id] = `${name} NOT IN (${value
            .map((val) => escape(String(val).trim()))
            .join(', ')})`;
          break;
        }
        case 'contains': {
          where[id] = value
            .map((val) => `${name} LIKE ${escape(`%${String(val).trim()}%`)}`)
            .join(' OR ');
          break;
        }
        case 'doesNotContain': {
          where[id] = value
            .map(
              (val) => `${name} NOT LIKE ${escape(`%${String(val).trim()}%`)}`
            )
            .join(' OR ');
          break;
        }
      }
    }
  });

  return where;
}

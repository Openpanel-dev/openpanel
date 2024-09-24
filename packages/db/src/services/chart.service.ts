import { escape } from 'sqlstring';

import { getTimezoneFromDateString } from '@openpanel/common';
import type {
  IChartEventFilter,
  IGetChartDataInput,
} from '@openpanel/validation';

import {
  TABLE_NAMES,
  formatClickhouseDate,
  toDate,
} from '../clickhouse-client';
import { createSqlBuilder } from '../sql-builder';

export function transformPropertyKey(property: string) {
  if (property.startsWith('properties.')) {
    if (property.includes('*')) {
      return property
        .replace(/^properties\./, '')
        .replace('.*.', '.%.')
        .replace(/\[\*\]$/, '.%')
        .replace(/\[\*\].?/, '.%.');
    }
    return `properties['${property.replace(/^properties\./, '')}']`;
  }

  return property;
}

export function getSelectPropertyKey(property: string) {
  if (property.startsWith('properties.')) {
    if (property.includes('*')) {
      return `arrayMap(x -> trim(x), mapValues(mapExtractKeyLike(properties, ${escape(
        transformPropertyKey(property),
      )})))`;
    }
    return `properties['${property.replace(/^properties\./, '')}']`;
  }

  return property;
}

export function getChartSql({
  event,
  breakdowns,
  interval,
  startDate,
  endDate,
  projectId,
  chartType,
  limit,
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

  sb.select.count = 'count(*) as count';
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
    sb.where.startDate = `${toDate('created_at', interval)} >= ${toDate(formatClickhouseDate(startDate), interval)}`;
  }

  if (endDate) {
    sb.where.endDate = `${toDate('created_at', interval)} <= ${toDate(formatClickhouseDate(endDate), interval)}`;
  }

  if (breakdowns.length > 0 && limit) {
    sb.where.bar = `(${breakdowns.map((b) => getSelectPropertyKey(b.name)).join(',')}) IN (
      SELECT ${breakdowns.map((b) => getSelectPropertyKey(b.name)).join(',')}
      FROM ${TABLE_NAMES.events}
      ${getWhere()}
      GROUP BY ${breakdowns.map((b) => getSelectPropertyKey(b.name)).join(',')}
      ORDER BY count(*) DESC
      LIMIT ${limit}
    )`;
  }

  breakdowns.forEach((breakdown, index) => {
    const key = `label_${index}`;
    sb.select[key] = `${getSelectPropertyKey(breakdown.name)} as ${key}`;
    sb.groupBy[key] = `${key}`;
  });

  if (event.segment === 'user') {
    sb.select.count = 'countDistinct(profile_id) as count';
  }

  if (event.segment === 'session') {
    sb.select.count = 'countDistinct(session_id) as count';
  }

  if (event.segment === 'user_average') {
    sb.select.count =
      'COUNT(*)::float / COUNT(DISTINCT profile_id)::float as count';
  }

  if (event.segment === 'property_sum' && event.property) {
    sb.select.count = `sum(toFloat64(${getSelectPropertyKey(event.property)})) as count`;
    sb.where.property = `${getSelectPropertyKey(event.property)} IS NOT NULL`;
  }

  if (event.segment === 'property_average' && event.property) {
    sb.select.count = `avg(toFloat64(${getSelectPropertyKey(event.property)})) as count`;
    sb.where.property = `${getSelectPropertyKey(event.property)} IS NOT NULL`;
  }

  if (event.segment === 'one_event_per_user') {
    sb.from = `(
      SELECT DISTINCT ON (profile_id) * from ${TABLE_NAMES.events} WHERE ${join(
        sb.where,
        ' AND ',
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
        where[id] = 'profile_id != device_id';
      } else {
        where[id] = 'profile_id = device_id';
      }
      return;
    }

    if (name.startsWith('properties.')) {
      const propertyKey = getSelectPropertyKey(name);
      const isWildcard = propertyKey.includes('%');
      const whereFrom = getSelectPropertyKey(name);

      switch (operator) {
        case 'is': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `x = ${escape(String(val).trim())}`)
              .join(' OR ')}, ${whereFrom})`;
          } else {
            if (value.length === 1) {
              where[id] = `${whereFrom} = ${escape(String(value[0]).trim())}`;
            } else {
              where[id] = `${whereFrom} IN (${value
                .map((val) => escape(String(val).trim()))
                .join(', ')})`;
            }
          }
          break;
        }
        case 'isNot': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `x != ${escape(String(val).trim())}`)
              .join(' OR ')}, ${whereFrom})`;
          } else {
            if (value.length === 1) {
              where[id] = `${whereFrom} != ${escape(String(value[0]).trim())}`;
            } else {
              where[id] = `${whereFrom} NOT IN (${value
                .map((val) => escape(String(val).trim()))
                .join(', ')})`;
            }
          }
          break;
        }
        case 'contains': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `x LIKE ${escape(`%${String(val).trim()}%`)}`)
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `${whereFrom} LIKE ${escape(`%${String(val).trim()}%`)}`,
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'doesNotContain': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `x NOT LIKE ${escape(`%${String(val).trim()}%`)}`)
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `${whereFrom} NOT LIKE ${escape(`%${String(val).trim()}%`)}`,
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'startsWith': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `x LIKE ${escape(`${String(val).trim()}%`)}`)
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `${whereFrom} LIKE ${escape(`${String(val).trim()}%`)}`,
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'endsWith': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `x LIKE ${escape(`%${String(val).trim()}`)}`)
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) =>
                  `${whereFrom} LIKE ${escape(`%${String(val).trim()}`)}`,
              )
              .join(' OR ')})`;
          }
          break;
        }
        case 'regex': {
          if (isWildcard) {
            where[id] = `arrayExists(x -> ${value
              .map((val) => `match(x, ${escape(String(val).trim())})`)
              .join(' OR ')}, ${whereFrom})`;
          } else {
            where[id] = `(${value
              .map(
                (val) => `match(${whereFrom}, ${escape(String(val).trim())})`,
              )
              .join(' OR ')})`;
          }
          break;
        }
      }
    } else {
      switch (operator) {
        case 'is': {
          if (value.length === 1) {
            where[id] = `${name} = ${escape(String(value[0]).trim())}`;
          } else {
            where[id] = `${name} IN (${value
              .map((val) => escape(String(val).trim()))
              .join(', ')})`;
          }
          break;
        }
        case 'isNot': {
          if (value.length === 1) {
            where[id] = `${name} != ${escape(String(value[0]).trim())}`;
          } else {
            where[id] = `${name} NOT IN (${value
              .map((val) => escape(String(val).trim()))
              .join(', ')})`;
          }
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
              (val) => `${name} NOT LIKE ${escape(`%${String(val).trim()}%`)}`,
            )
            .join(' OR ');
          break;
        }
        case 'startsWith': {
          where[id] = value
            .map((val) => `${name} LIKE ${escape(`${String(val).trim()}%`)}`)
            .join(' OR ');
          break;
        }
        case 'endsWith': {
          where[id] = value
            .map((val) => `${name} LIKE ${escape(`%${String(val).trim()}`)}`)
            .join(' OR ');
          break;
        }
        case 'regex': {
          where[id] = value
            .map((val) => `match(${name}, ${escape(String(val).trim())})`)
            .join(' OR ');
          break;
        }
      }
    }
  });

  return where;
}

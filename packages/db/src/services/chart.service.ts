import { escape } from 'sqlstring';

import { getTimezoneFromDateString } from '@openpanel/common';
import type {
  IChartEventFilter,
  IGetChartDataInput,
} from '@openpanel/validation';

import { formatClickhouseDate } from '../clickhouse-client';
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

  let labelValue = escape('*');
  if (event.name !== '*') {
    labelValue = `${escape(event.name)}`;
    sb.select.label = `${labelValue} as label`;
    sb.where.eventName = `name = ${labelValue}`;
  } else {
    sb.select.label = `${labelValue} as label`;
  }

  sb.select.count = `count(*) as count`;
  switch (interval) {
    case 'minute': {
      sb.select.date = `toStartOfMinute(toTimeZone(created_at, '${getTimezoneFromDateString(startDate)}')) as date`;
      sb.orderBy.date = `date ASC WITH FILL FROM toStartOfMinute(toTimeZone(toDateTime('${formatClickhouseDate(startDate)}'), '${getTimezoneFromDateString(startDate)}')) TO toStartOfMinute(toTimeZone(toDateTime('${formatClickhouseDate(endDate)}'), '${getTimezoneFromDateString(startDate)}')) STEP toIntervalMinute(1) INTERPOLATE ( label as ${labelValue} )`;
      break;
    }
    case 'hour': {
      sb.select.date = `toStartOfHour(toTimeZone(created_at, '${getTimezoneFromDateString(startDate)}')) as date`;
      sb.orderBy.date = `date ASC WITH FILL FROM toStartOfHour(toTimeZone(toDateTime('${formatClickhouseDate(startDate)}'), '${getTimezoneFromDateString(startDate)}')) TO toStartOfHour(toTimeZone(toDateTime('${formatClickhouseDate(endDate)}'), '${getTimezoneFromDateString(startDate)}')) STEP toIntervalHour(1) INTERPOLATE ( label as ${labelValue} )`;
      break;
    }
    case 'day': {
      sb.select.date = `toStartOfDay(toTimeZone(created_at, '${getTimezoneFromDateString(startDate)}')) as date`;
      sb.orderBy.date = `date ASC WITH FILL FROM toStartOfDay(toTimeZone(toDateTime('${formatClickhouseDate(startDate)}'), '${getTimezoneFromDateString(startDate)}')) TO toStartOfDay(toTimeZone(toDateTime('${formatClickhouseDate(endDate)}'), '${getTimezoneFromDateString(startDate)}')) STEP toIntervalDay(1) INTERPOLATE ( label as ${labelValue} )`;
      break;
    }
    case 'month': {
      sb.select.date = `toStartOfMonth(toTimeZone(created_at, '${getTimezoneFromDateString(startDate)}')) as date`;
      sb.orderBy.date = `date ASC WITH FILL FROM toStartOfMonth(toTimeZone(toDateTime('${formatClickhouseDate(startDate)}'), '${getTimezoneFromDateString(startDate)}')) TO toStartOfMonth(toTimeZone(toDateTime('${formatClickhouseDate(endDate)}'), '${getTimezoneFromDateString(startDate)}')) STEP toIntervalMonth(1) INTERPOLATE ( label as ${labelValue} )`;
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

  const breakdown = breakdowns[0]!;
  if (breakdown) {
    const value = breakdown.name.startsWith('properties.')
      ? `mapValues(mapExtractKeyLike(properties, ${escape(
          breakdown.name.replace(/^properties\./, '').replace('.*.', '.%.')
        )}))`
      : escape(breakdown.name);
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
      const whereFrom = `mapValues(mapExtractKeyLike(properties, ${escape(
        name.replace(/^properties\./, '').replace('.*.', '.%.')
      )}))`;

      switch (operator) {
        case 'is': {
          where[id] = `arrayExists(x -> ${value
            .map((val) => `x = ${escape(String(val).trim())}`)
            .join(' OR ')}, ${whereFrom})`;
          break;
        }
        case 'isNot': {
          where[id] = `arrayExists(x -> ${value
            .map((val) => `x != ${escape(String(val).trim())}`)
            .join(' OR ')}, ${whereFrom})`;
          break;
        }
        case 'contains': {
          where[id] = `arrayExists(x -> ${value
            .map((val) => `x LIKE ${escape(`%${String(val).trim()}%`)}`)
            .join(' OR ')}, ${whereFrom})`;
          break;
        }
        case 'doesNotContain': {
          where[id] = `arrayExists(x -> ${value
            .map((val) => `x NOT LIKE ${escape(`%${String(val).trim()}%`)}`)
            .join(' OR ')}, ${whereFrom})`;
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

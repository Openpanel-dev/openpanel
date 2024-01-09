import type { IGetChartDataInput } from '@/types';

import {
  createSqlBuilder,
  getWhereClause,
  isJsonPath,
  selectJsonPath,
} from './helpers';

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

  sb.where.projectId = `project_id = '${projectId}'`;
  if (event.name !== '*') {
    sb.where.eventName = `name = '${event.name}'`;
  }
  sb.where.eventFilter = join(getWhereClause(event.filters), ' AND ');

  sb.select.count = `count(*)::int as count`;
  sb.select.date = `date_trunc('${interval}', "createdAt") as date`;
  sb.groupBy.date = 'date';
  sb.orderBy.date = 'date ASC';

  if (startDate) {
    sb.where.startDate = `"createdAt" >= '${startDate}'`;
  }

  if (endDate) {
    sb.where.endDate = `"createdAt" <= '${endDate}'`;
  }

  const breakdown = breakdowns[0]!;
  if (breakdown) {
    if (isJsonPath(breakdown.name)) {
      sb.select.label = `${selectJsonPath(breakdown.name)} as label`;
    } else {
      sb.select.label = `${breakdown.name} as label`;
    }
    sb.groupBy.label = `label`;
  }

  if (event.segment === 'user') {
    sb.select.count = `count(DISTINCT profile_id)::int as count`;
  }

  if (event.segment === 'user_average') {
    sb.select.count = `COUNT(*)::float / COUNT(DISTINCT profile_id)::float as count`;
  }

  if (event.segment === 'one_event_per_user') {
    sb.from = `(
      SELECT DISTINCT on (profile_id) * from events WHERE ${join(
        sb.where,
        ' AND '
      )}
        ORDER BY profile_id, "createdAt" DESC
      ) as subQuery`;

    return log(`${getSelect()} ${getFrom()} ${getGroupBy()} ${getOrderBy()}`);
  }

  return log(
    `${getSelect()} ${getFrom()} ${getWhere()} ${getGroupBy()} ${getOrderBy()}`
  );
}

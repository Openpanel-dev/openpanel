import { TABLE_NAMES } from './clickhouse/client';

export interface SqlBuilderObject {
  where: Record<string, string>;
  having: Record<string, string>;
  select: Record<string, string>;
  groupBy: Record<string, string>;
  orderBy: Record<string, string>;
  from: string;
  joins: Record<string, string>;
  limit: number | undefined;
  offset: number | undefined;
  fill: string | undefined;
}

export function createSqlBuilder() {
  const join = (obj: Record<string, string> | string[], joiner: string) =>
    Object.values(obj).filter(Boolean).join(joiner);

  const sb: SqlBuilderObject = {
    where: {},
    from: `${TABLE_NAMES.events} e`,
    select: {},
    groupBy: {},
    orderBy: {},
    having: {},
    joins: {},
    limit: undefined,
    offset: undefined,
    fill: undefined,
  };

  const getWhere = () =>
    Object.keys(sb.where).length ? `WHERE ${join(sb.where, ' AND ')}` : '';
  const getHaving = () =>
    Object.keys(sb.having).length ? `HAVING ${join(sb.having, ' AND ')}` : '';
  const getFrom = () => `FROM ${sb.from}`;
  const getSelect = () =>
    `SELECT ${Object.keys(sb.select).length ? join(sb.select, ', ') : '*'}`;
  const getGroupBy = () =>
    Object.keys(sb.groupBy).length ? `GROUP BY ${join(sb.groupBy, ', ')}` : '';
  const getOrderBy = () =>
    Object.keys(sb.orderBy).length ? `ORDER BY ${join(sb.orderBy, ', ')}` : '';
  const getLimit = () => (sb.limit ? `LIMIT ${sb.limit}` : '');
  const getOffset = () => (sb.offset ? `OFFSET ${sb.offset}` : '');
  const getJoins = () =>
    Object.keys(sb.joins).length ? join(sb.joins, ' ') : '';
  const getFill = () => (sb.fill ? `WITH FILL ${sb.fill}` : '');

  return {
    sb,
    join,
    getWhere,
    getFrom,
    getSelect,
    getGroupBy,
    getOrderBy,
    getHaving,
    getJoins,
    getFill,
    getSql: () => {
      const sql = [
        getSelect(),
        getFrom(),
        getJoins(),
        getWhere(),
        getGroupBy(),
        getHaving(),
        getOrderBy(),
        getLimit(),
        getOffset(),
        getFill(),
      ]
        .filter(Boolean)
        .join(' ');
      return sql;
    },
  };
}

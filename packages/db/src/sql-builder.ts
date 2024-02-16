export interface SqlBuilderObject {
  where: Record<string, string>;
  select: Record<string, string>;
  groupBy: Record<string, string>;
  orderBy: Record<string, string>;
  from: string;
  limit: number | undefined;
  offset: number | undefined;
}

export function createSqlBuilder() {
  const join = (obj: Record<string, string> | string[], joiner: string) =>
    Object.values(obj).filter(Boolean).join(joiner);

  const sb: SqlBuilderObject = {
    where: {},
    from: 'openpanel.events',
    select: {},
    groupBy: {},
    orderBy: {},
    limit: undefined,
    offset: undefined,
  };

  const getWhere = () =>
    Object.keys(sb.where).length ? 'WHERE ' + join(sb.where, ' AND ') : '';
  const getFrom = () => `FROM ${sb.from}`;
  const getSelect = () =>
    'SELECT ' + (Object.keys(sb.select).length ? join(sb.select, ', ') : '*');
  const getGroupBy = () =>
    Object.keys(sb.groupBy).length ? 'GROUP BY ' + join(sb.groupBy, ', ') : '';
  const getOrderBy = () =>
    Object.keys(sb.orderBy).length ? 'ORDER BY ' + join(sb.orderBy, ', ') : '';
  const getLimit = () => (sb.limit ? `LIMIT ${sb.limit}` : '');
  const getOffset = () => (sb.offset ? `OFFSET ${sb.offset}` : '');

  return {
    sb,
    join,
    getWhere,
    getFrom,
    getSelect,
    getGroupBy,
    getOrderBy,
    getSql: () => {
      const sql = [
        getSelect(),
        getFrom(),
        getWhere(),
        getGroupBy(),
        getOrderBy(),
        getLimit(),
        getOffset(),
      ]
        .filter(Boolean)
        .join(' ');
      console.log('---');
      console.log(sql);
      console.log('---');

      return sql;
    },
  };
}

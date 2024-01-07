import type { IChartEventFilter } from '@/types';

export function getWhereClause(filters: IChartEventFilter[]) {
  const where: string[] = [];
  if (filters.length > 0) {
    filters.forEach((filter) => {
      const { name, value, operator } = filter;
      switch (operator) {
        case 'contains': {
          if (name.includes('.*.') || name.endsWith('[*]')) {
            // TODO: Make sure this works
            // where.push(
            //   `properties @? '$.${name
            //     .replace(/^properties\./, '')
            //     .replace(/\.\*\./g, '[*].')} ? (@ like_regex "${value[0]}")'`
            // );
          } else {
            where.push(
              `(${value
                .map(
                  (val) =>
                    `${propertyNameToSql(name)} like '%${String(val).replace(
                      /'/g,
                      "''"
                    )}%'`
                )
                .join(' OR ')})`
            );
          }
          break;
        }
        case 'is': {
          if (name.includes('.*.') || name.endsWith('[*]')) {
            where.push(
              `properties @? '$.${name
                .replace(/^properties\./, '')
                .replace(/\.\*\./g, '[*].')} ? (${value
                .map((val) => `@ == "${val}"`)
                .join(' || ')})'`
            );
          } else {
            where.push(
              `${propertyNameToSql(name)} in (${value
                .map((val) => `'${val}'`)
                .join(', ')})`
            );
          }
          break;
        }
        case 'isNot': {
          if (name.includes('.*.') || name.endsWith('[*]')) {
            where.push(
              `properties @? '$.${name
                .replace(/^properties\./, '')
                .replace(/\.\*\./g, '[*].')} ? (${value
                .map((val) => `@ != "${val}"`)
                .join(' && ')})'`
            );
          } else if (name.includes('.')) {
            where.push(
              `${propertyNameToSql(name)} not in (${value
                .map((val) => `'${val}'`)
                .join(', ')})`
            );
          }
          break;
        }
      }
    });
  }

  return where;
}

export function selectJsonPath(property: string) {
  const jsonPath = property
    .replace(/^properties\./, '')
    .replace(/\.\*\./g, '.**.');
  return `jsonb_path_query(properties, '$.${jsonPath}')`;
}

export function isJsonPath(property: string) {
  return property.startsWith('properties');
}

export function propertyNameToSql(name: string) {
  if (name.includes('.')) {
    const str = name
      .split('.')
      .map((item, index) => (index === 0 ? item : `'${item}'`))
      .join('->');
    const findLastOf = '->';
    const lastArrow = str.lastIndexOf(findLastOf);
    if (lastArrow === -1) {
      return str;
    }
    const first = str.slice(0, lastArrow);
    const last = str.slice(lastArrow + findLastOf.length);
    return `${first}->>${last}`;
  }

  return name;
}

export function createSqlBuilder() {
  const join = (obj: Record<string, string> | string[], joiner: string) =>
    Object.values(obj).filter(Boolean).join(joiner);

  const sb: {
    where: Record<string, string>;
    select: Record<string, string>;
    groupBy: Record<string, string>;
    orderBy: Record<string, string>;
    from: string;
  } = {
    where: {},
    from: 'events',
    select: {},
    groupBy: {},
    orderBy: {},
  };

  return {
    sb,
    join,
    getWhere: () =>
      Object.keys(sb.where).length ? 'WHERE ' + join(sb.where, ' AND ') : '',
    getFrom: () => `FROM ${sb.from}`,
    getSelect: () =>
      'SELECT ' + (Object.keys(sb.select).length ? join(sb.select, ', ') : '*'),
    getGroupBy: () =>
      Object.keys(sb.groupBy).length
        ? 'GROUP BY ' + join(sb.groupBy, ', ')
        : '',
    getOrderBy: () =>
      Object.keys(sb.orderBy).length
        ? 'ORDER BY ' + join(sb.orderBy, ', ')
        : '',
  };
}

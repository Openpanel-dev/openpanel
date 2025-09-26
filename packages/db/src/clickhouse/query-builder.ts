import type { ClickHouseClient, ResponseJSON } from '@clickhouse/client';
import type { IInterval } from '@openpanel/validation';
import { escape } from 'sqlstring';

type SqlValue = string | number | boolean | Date | null | Expression;
type SqlParam = SqlValue | SqlValue[];
type Operator =
  | '='
  | '>'
  | '<'
  | '>='
  | '<='
  | '!='
  | 'IN'
  | 'NOT IN'
  | 'LIKE'
  | 'NOT LIKE'
  | 'IS NULL'
  | 'IS NOT NULL'
  | 'BETWEEN';

type CTE = {
  name: string;
  query: Query | string;
};

type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS' | 'LEFT ANY';

type WhereCondition = {
  condition: string;
  operator: 'AND' | 'OR';
  isGroup?: boolean;
};

type ConditionalCallback = (query: Query) => void;

class Expression {
  constructor(private expression: string) {}

  toString() {
    return this.expression;
  }
}

export class Query<T = any> {
  private _select: string[] = [];
  private _except: string[] = [];
  private _from?: string | Expression;
  private _where: WhereCondition[] = [];
  private _groupBy: string[] = [];
  private _rollup = false;
  private _having: { condition: string; operator: 'AND' | 'OR' }[] = [];
  private _orderBy: {
    column: string;
    direction: 'ASC' | 'DESC';
  }[] = [];
  private _limit?: number;
  private _offset?: number;
  private _final = false;
  private _settings: Record<string, string> = {};
  private _ctes: CTE[] = [];
  private _joins: {
    type: JoinType;
    table: string | Expression | Query;
    condition: string;
    alias?: string;
  }[] = [];
  private _skipNext = false;
  private _fill?: {
    from: string | Date;
    to: string | Date;
    step: string;
  };
  private _transform?: Record<string, (item: T) => any>;
  private _union?: Query;
  private _dateRegex = /\d{4}-\d{2}-\d{2}([\s\:\d\.]+)?/g;
  constructor(
    private client: ClickHouseClient,
    private timezone: string,
  ) {}

  // Select methods
  select<U>(
    columns: (string | null | undefined | false)[],
    type: 'merge' | 'replace' = 'replace',
  ): Query<U> {
    if (this._skipNext) return this as unknown as Query<U>;
    if (type === 'merge') {
      this._select = [
        ...this._select,
        ...columns.filter((col): col is string => Boolean(col)),
      ];
    } else {
      this._select = columns.filter((col): col is string => Boolean(col));
    }
    return this as unknown as Query<U>;
  }

  except(columns: string[]): this {
    this._except = [...this._except, ...columns];
    return this;
  }

  rollup(): this {
    this._rollup = true;
    return this;
  }

  // From methods
  from(table: string | Expression, final = false): this {
    this._from = table;
    this._final = final;
    return this;
  }

  union(query: Query): this {
    this._union = query;
    return this;
  }

  // Where methods
  private escapeValue(value: SqlParam): string {
    if (value === null) return 'NULL';
    if (value instanceof Expression) return `(${value.toString()})`;
    if (Array.isArray(value)) {
      return `(${value.map((v) => this.escapeValue(v)).join(', ')})`;
    }

    if (
      (typeof value === 'string' && this._dateRegex.test(value)) ||
      value instanceof Date
    ) {
      return this.escapeDate(value);
    }

    return escape(value);
  }

  where(column: string, operator: Operator, value?: SqlParam): this {
    if (this._skipNext) return this;
    const condition = this.buildCondition(column, operator, value);
    this._where.push({ condition, operator: 'AND' });
    return this;
  }

  public buildCondition(
    column: string,
    operator: Operator,
    value?: SqlParam,
  ): string {
    switch (operator) {
      case 'IS NULL':
        return `${column} IS NULL`;
      case 'IS NOT NULL':
        return `${column} IS NOT NULL`;
      case 'BETWEEN':
        if (Array.isArray(value) && value.length === 2) {
          return `${column} BETWEEN ${this.escapeValue(value[0]!)} AND ${this.escapeValue(value[1]!)}`;
        }
        throw new Error('BETWEEN operator requires an array of two values');
      case 'IN':
      case 'NOT IN':
        if (!Array.isArray(value) && !(value instanceof Expression)) {
          throw new Error(`${operator} operator requires an array value`);
        }
        return `${column} ${operator} ${this.escapeValue(value)}`;
      default:
        return `${column} ${operator} ${this.escapeValue(value!)}`;
    }
  }

  andWhere(column: string, operator: Operator, value?: SqlParam): this {
    const condition = this.buildCondition(column, operator, value);
    this._where.push({ condition, operator: 'AND' });
    return this;
  }

  rawWhere(condition: string): this {
    if (condition) {
      this._where.push({ condition, operator: 'AND' });
    }
    return this;
  }

  orWhere(column: string, operator: Operator, value?: SqlParam): this {
    const condition = this.buildCondition(column, operator, value);
    this._where.push({ condition, operator: 'OR' });
    return this;
  }

  // Group by methods
  groupBy(columns: (string | null | undefined | false)[]): this {
    this._groupBy = columns.filter((col): col is string => Boolean(col));
    return this;
  }

  // Having methods
  having(column: string, operator: Operator, value: SqlParam): this {
    const condition = this.buildCondition(column, operator, value);
    this._having.push({ condition, operator: 'AND' });
    return this;
  }

  andHaving(column: string, operator: Operator, value: SqlParam): this {
    const condition = this.buildCondition(column, operator, value);
    this._having.push({ condition, operator: 'AND' });
    return this;
  }

  orHaving(column: string, operator: Operator, value: SqlParam): this {
    const condition = this.buildCondition(column, operator, value);
    this._having.push({ condition, operator: 'OR' });
    return this;
  }

  // Order by methods
  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    if (this._skipNext) return this;
    this._orderBy.push({ column, direction });
    return this;
  }

  // Limit and offset
  limit(limit?: number): this {
    if (limit !== undefined) {
      this._limit = limit;
    }
    return this;
  }

  offset(offset?: number): this {
    if (offset !== undefined) {
      this._offset = offset;
    }
    return this;
  }

  // Settings
  settings(settings: Record<string, string>): this {
    Object.assign(this._settings, settings);
    return this;
  }

  with(name: string, query: Query | string): this {
    this._ctes.push({ name, query });
    return this;
  }

  // Fill
  fill(from: string | Date, to: string | Date, step: string): this {
    this._fill = {
      from: this.escapeDate(from),
      to: this.escapeDate(to),
      step: step,
    };
    return this;
  }

  private escapeDate(value: string | Date): string {
    if (value instanceof Date) {
      return escape(clix.datetime(value));
    }

    return value.replaceAll(this._dateRegex, (match) => {
      return escape(match);
    });
  }

  // Add join methods
  join(table: string | Expression, condition: string, alias?: string): this {
    return this.joinWithType('INNER', table, condition, alias);
  }

  innerJoin(
    table: string | Expression,
    condition: string,
    alias?: string,
  ): this {
    return this.joinWithType('INNER', table, condition, alias);
  }

  leftJoin(
    table: string | Expression | Query,
    condition: string,
    alias?: string,
  ): this {
    return this.joinWithType('LEFT', table, condition, alias);
  }

  leftAnyJoin(
    table: string | Expression | Query,
    condition: string,
    alias?: string,
  ): this {
    return this.joinWithType('LEFT ANY', table, condition, alias);
  }

  rightJoin(
    table: string | Expression,
    condition: string,
    alias?: string,
  ): this {
    return this.joinWithType('RIGHT', table, condition, alias);
  }

  fullJoin(
    table: string | Expression,
    condition: string,
    alias?: string,
  ): this {
    return this.joinWithType('FULL', table, condition, alias);
  }

  crossJoin(table: string | Expression, alias?: string): this {
    return this.joinWithType('CROSS', table, '', alias);
  }

  private joinWithType(
    type: JoinType,
    table: string | Expression | Query,
    condition: string,
    alias?: string,
  ): this {
    if (this._skipNext) return this;
    this._joins.push({
      type,
      table,
      condition: this.escapeDate(condition),
      alias,
    });
    return this;
  }

  // Add methods for grouping conditions
  whereGroup(): WhereGroupBuilder {
    return new WhereGroupBuilder(this, 'AND');
  }

  orWhereGroup(): WhereGroupBuilder {
    return new WhereGroupBuilder(this, 'OR');
  }

  // Update buildQuery method's WHERE section
  private buildWhereConditions(conditions: WhereCondition[]): string {
    return conditions
      .map((w, i) => {
        const condition = w.isGroup ? `(${w.condition})` : w.condition;
        return i === 0 ? condition : `${w.operator} ${condition}`;
      })
      .join(' ');
  }

  private buildQuery(): string {
    const parts: string[] = [];

    // Add WITH clause if CTEs exist
    if (this._ctes.length > 0) {
      const cteStatements = this._ctes.map((cte) => {
        const queryStr =
          typeof cte.query === 'string' ? cte.query : cte.query.toSQL();
        return `${cte.name} AS (${queryStr})`;
      });
      parts.push(`WITH ${cteStatements.join(', ')}`);
    }

    // SELECT
    if (this._select.length > 0) {
      parts.push(
        'SELECT',
        this._select.map((col) => this.escapeDate(col)).join(', '),
      );
    } else {
      parts.push('SELECT *');
    }

    if (this._except.length > 0) {
      parts.push('EXCEPT', `(${this._except.map(this.escapeDate).join(', ')})`);
    }

    // FROM
    if (this._from) {
      if (this._from instanceof Expression) {
        parts.push(`FROM (${this._from.toString()})`);
      } else {
        parts.push(`FROM ${this._from}${this._final ? ' FINAL' : ''}`);
      }

      // Add joins
      this._joins.forEach((join) => {
        const aliasClause = join.alias ? ` ${join.alias} ` : ' ';
        const conditionStr = join.condition ? `ON ${join.condition}` : '';
        parts.push(
          `${join.type} JOIN ${join.table instanceof Query ? `(${join.table.toSQL()})` : join.table instanceof Expression ? `(${join.table.toString()})` : join.table}${aliasClause}${conditionStr}`,
        );
      });
    }

    // WHERE
    if (this._where.length > 0) {
      parts.push('WHERE', this.buildWhereConditions(this._where));
    }

    // GROUP BY
    if (this._groupBy.length > 0) {
      parts.push('GROUP BY', this._groupBy.join(', '));
    }

    if (this._rollup) {
      parts.push('WITH ROLLUP');
    }

    // HAVING
    if (this._having.length > 0) {
      const conditions = this._having.map((h, i) => {
        return i === 0 ? h.condition : `${h.operator} ${h.condition}`;
      });
      parts.push('HAVING', conditions.join(' '));
    }

    // ORDER BY
    if (this._orderBy.length > 0) {
      const orderBy = this._orderBy.map((o) => {
        const col = o.column;
        return `${col} ${o.direction}`;
      });
      parts.push('ORDER BY', orderBy.join(', '));
    }

    // Add FILL clause after ORDER BY
    if (this._fill) {
      const fromDate =
        this._fill.from instanceof Date
          ? clix.datetime(this._fill.from)
          : this._fill.from;
      const toDate =
        this._fill.to instanceof Date
          ? clix.datetime(this._fill.to)
          : this._fill.to;

      parts.push('WITH FILL');
      parts.push(`FROM ${fromDate}`);
      parts.push(`TO ${toDate}`);
      parts.push(`STEP ${this._fill.step}`);
    }

    // LIMIT & OFFSET
    if (this._limit !== undefined) {
      parts.push(`LIMIT ${this._limit}`);
      if (this._offset !== undefined) {
        parts.push(`OFFSET ${this._offset}`);
      }
    }

    // SETTINGS
    if (Object.keys(this._settings).length > 0) {
      const settings = Object.entries(this._settings)
        .map(([key, value]) => `${key} = ${value}`)
        .join(', ');
      parts.push(`SETTINGS ${settings}`);
    }

    if (this._union) {
      parts.push('UNION ALL', this._union.buildQuery());
    }

    return parts.join(' ');
  }

  transformJson<E extends ResponseJSON<any>>(json: E): E {
    const keys = Object.keys(json.data[0] || {});
    const response = {
      ...json,
      data: json.data.map((item) => {
        return keys.reduce((acc, key) => {
          const meta = json.meta?.find((m) => m.name === key);
          const transformer = this._transform?.[key];

          if (transformer) {
            return {
              ...acc,
              [key]: transformer(item),
            };
          }

          return {
            ...acc,
            [key]:
              item[key] && meta?.type.includes('Int')
                ? Number.parseFloat(item[key] as string)
                : item[key],
          };
        }, {} as T);
      }),
    };
    return response;
  }

  transform(transformations: Record<string, (item: T) => any>): this {
    this._transform = transformations;
    return this;
  }

  // Execution methods
  async execute(): Promise<T[]> {
    const query = this.buildQuery();
    console.log('query', query);

    const result = await this.client.query({
      query,
      clickhouse_settings: {
        session_timezone: this.timezone,
      },
    });
    const json = await result.json<T>();
    return this.transformJson(json).data;
  }

  // Debug methods
  toSQL(): string {
    return this.buildQuery();
  }

  // Add method to add where conditions (for internal use)
  _addWhereCondition(condition: WhereCondition): this {
    this._where.push(condition);
    return this;
  }

  if(condition: any): this {
    this._skipNext = !condition;
    return this;
  }

  endIf(): this {
    this._skipNext = false;
    return this;
  }

  // Add method for callback-style conditionals
  when(condition: boolean, callback?: ConditionalCallback): this {
    if (condition && callback) {
      callback(this);
    }
    return this;
  }

  clone(): Query<T> {
    return new Query(this.client, this.timezone).merge(this);
  }

  // Add merge method
  merge(query: Query): this {
    if (this._skipNext) return this;

    this._from = query._from;

    this._select = [...this._select, ...query._select];

    this._except = [...this._except, ...query._except];

    // Merge WHERE conditions
    this._where = [...this._where, ...query._where];

    // Merge CTEs
    this._ctes = [...this._ctes, ...query._ctes];

    // Merge JOINS
    this._joins = [...this._joins, ...query._joins];

    // Merge settings
    this._settings = { ...this._settings, ...query._settings };

    // Take the most restrictive LIMIT
    if (query._limit !== undefined) {
      this._limit =
        this._limit === undefined
          ? query._limit
          : Math.min(this._limit, query._limit);
    }

    // Merge ORDER BY
    this._orderBy = [...this._orderBy, ...query._orderBy];

    // Merge GROUP BY
    this._groupBy = [...this._groupBy, ...query._groupBy];

    // Merge HAVING conditions
    this._having = [...this._having, ...query._having];

    return this;
  }
}

// Add this new class for building where groups
export class WhereGroupBuilder {
  private conditions: WhereCondition[] = [];

  constructor(
    private query: Query,
    private groupOperator: 'AND' | 'OR',
  ) {}

  where(column: string, operator: Operator, value?: SqlParam): this {
    const condition = this.query.buildCondition(column, operator, value);
    this.conditions.push({ condition, operator: 'AND' });
    return this;
  }

  andWhere(column: string, operator: Operator, value?: SqlParam): this {
    const condition = this.query.buildCondition(column, operator, value);
    this.conditions.push({ condition, operator: 'AND' });
    return this;
  }

  rawWhere(condition: string): this {
    this.conditions.push({ condition, operator: 'AND' });
    return this;
  }

  orWhere(column: string, operator: Operator, value?: SqlParam): this {
    const condition = this.query.buildCondition(column, operator, value);
    this.conditions.push({ condition, operator: 'OR' });
    return this;
  }

  end(): Query {
    const groupCondition = this.conditions
      .map((c, i) => (i === 0 ? c.condition : `${c.operator} ${c.condition}`))
      .join(' ');

    this.query._addWhereCondition({
      condition: groupCondition,
      operator: this.groupOperator,
      isGroup: true,
    });

    return this.query;
  }
}

// Helper function to create a new query
export function clix(client: ClickHouseClient, timezone?: string): Query {
  return new Query(client, timezone ?? 'UTC');
}

clix.exp = (expr: string | Query<any>) =>
  new Expression(expr instanceof Query ? expr.toSQL() : expr);
clix.date = (date: string | Date, wrapper?: string) => {
  const dateStr = new Date(date).toISOString().slice(0, 10);
  return wrapper ? `${wrapper}(${dateStr})` : dateStr;
};
clix.datetime = (date: string | Date, wrapper?: string) => {
  const datetime = new Date(date).toISOString().slice(0, 19).replace('T', ' ');
  return wrapper ? `${wrapper}(${datetime})` : datetime;
};
clix.dynamicDatetime = (date: string | Date, interval: IInterval) => {
  if (interval === 'month' || interval === 'week') {
    return clix.date(date);
  }
  return clix.datetime(date);
};

clix.toStartOf = (node: string, interval: IInterval, timezone?: string) => {
  switch (interval) {
    case 'minute': {
      return `toStartOfMinute(${node})`;
    }
    case 'hour': {
      return `toStartOfHour(${node})`;
    }
    case 'day': {
      return `toStartOfDay(${node})`;
    }
    case 'week': {
      // Does not respect timezone settings (session_timezone) so we need to pass it manually
      return `toStartOfWeek(${node}${timezone ? `, 1, '${timezone}'` : ''})`;
    }
    case 'month': {
      // Does not respect timezone settings (session_timezone) so we need to pass it manually
      return `toStartOfMonth(${node}${timezone ? `, '${timezone}'` : ''})`;
    }
  }
};
clix.toStartOfInterval = (
  node: string,
  interval: IInterval,
  origin: string | Date,
) => {
  switch (interval) {
    case 'minute': {
      return `toStartOfInterval(toDateTime(${node}), INTERVAL 1 minute, toDateTime(${clix.datetime(origin)}))`;
    }
    case 'hour': {
      return `toStartOfInterval(toDateTime(${node}), INTERVAL 1 hour, toDateTime(${clix.datetime(origin)}))`;
    }
    case 'day': {
      return `toStartOfInterval(toDateTime(${node}), INTERVAL 1 day, toDateTime(${clix.datetime(origin)}))`;
    }
    case 'week': {
      return `toStartOfInterval(toDateTime(${node}), INTERVAL 1 week, toDateTime(${clix.datetime(origin)}))`;
    }
    case 'month': {
      return `toStartOfInterval(toDateTime(${node}), INTERVAL 1 month, toDateTime(${clix.datetime(origin)}))`;
    }
  }
};
clix.toInterval = (node: string, interval: IInterval) => {
  switch (interval) {
    case 'minute': {
      return `toIntervalMinute(${node})`;
    }
    case 'hour': {
      return `toIntervalHour(${node})`;
    }
    case 'day': {
      return `toIntervalDay(${node})`;
    }
    case 'week': {
      return `toIntervalWeek(${node})`;
    }
    case 'month': {
      return `toIntervalMonth(${node})`;
    }
  }
};
clix.toDate = (node: string, interval: IInterval) => {
  switch (interval) {
    case 'week':
    case 'month': {
      return `toDate(${node})`;
    }
    default: {
      return `toDateTime(${node})`;
    }
  }
};
// Export types
export type { SqlValue, SqlParam, Operator };

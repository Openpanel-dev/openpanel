/**
 * The ClickHouse `sql` tag.
 *
 * Two tiers, one tag:
 *
 * 1. **Static queries** are plain SQL text — the tag is a no-op wrapper. 2.
 * **Dynamic composition** builds from fragments, and every *value* binds as a
 * ClickHouse-native `{name:Type}` query parameter, escaped by the server rather
 * than by us.
 *
 * The safety property is the type of an interpolation slot: it accepts only
 * `SqlFragment | SqlParam`, so a bare string or number in a slot is a
 * compile-time error. There is deliberately no `sql.raw` — dynamic structure
 * composes with {@link SqlBuilder.join}, and the only path from an untrusted
 * string to SQL text is {@link SqlBuilder.id}, which validates and throws.
 *
 * Placeholder names are assigned at render time from a single counter, so
 * fragments nest and repeat without colliding.
 *
 * `packages/core` still imports this module by its deep path rather than
 * through the barrel: the barrel also re-exports `clickhouse/client.ts` and
 * `prisma-client.ts`, which construct a ClickHouse client array and a
 * PrismaClient at module load, so a barrel import from core would acquire a
 * second, request-scope-less client. `.dependency-cruiser.cjs`'s
 * `core-uses-ctx-not-db-internals` encodes exactly that, exempting this file by
 * path and not the barrel.
 */

/** Auto-generated placeholders are `{p1:Type}`, `{p2:Type}`, … */
const PARAM_NAME_PREFIX = 'p';
const FIRST_PARAM_INDEX = 1;

/** `table.column` is the deepest qualification any call site needs. */
const IDENTIFIER_MAX_PARTS = 2;
const IDENTIFIER_MAX_LENGTH = 64;
const IDENTIFIER_PART_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const DEFAULT_DATETIME64_PRECISION = 3;
const ISO_DATE_LENGTH = 'YYYY-MM-DD'.length;

const FRAGMENT_BRAND: unique symbol = Symbol('openpanel.sql.fragment');
const PARAM_BRAND: unique symbol = Symbol('openpanel.sql.param');

/**
 * What `@clickhouse/client` can serialize into `query_params`. Values are
 * handed over untouched — the driver escapes them and the server parses them
 * against the declared type.
 */
export type SqlParamValue =
  | string
  | number
  | bigint
  | boolean
  | Date
  | null
  | readonly SqlParamValue[]
  | ReadonlyMap<string | number, SqlParamValue>
  | { readonly [key: string]: SqlParamValue };

/** A ClickHouse type name as written inside a placeholder, e.g. `Array(String)`. */
export type SqlParamType = string;

/** A single bound value. Only ever produced by the `sql.*` constructors. */
export interface SqlParam {
  readonly [PARAM_BRAND]: true;
  readonly type: SqlParamType;
  readonly value: SqlParamValue;
}

/** The only things an interpolation slot accepts. */
export type SqlSlot = SqlFragment | SqlParam;

/** What goes on the wire: query text plus the params it references. */
export interface SqlStatement {
  readonly query: string;
  readonly query_params: Record<string, SqlParamValue>;
}

interface RenderState {
  readonly text: string[];
  readonly params: Record<string, SqlParamValue>;
  nextIndex: number;
}

/**
 * A piece of SQL and the slots between its literal parts. Immutable and
 * name-free: placeholder names are only assigned by {@link toStatement}, which
 * is what makes nesting and reuse collision-free.
 */
export class SqlFragment {
  readonly [FRAGMENT_BRAND] = true as const;

  constructor(
    readonly strings: readonly string[],
    readonly slots: readonly SqlSlot[]
  ) {}

  toStatement(): SqlStatement {
    const state: RenderState = {
      text: [],
      params: {},
      nextIndex: FIRST_PARAM_INDEX,
    };
    render(this, state);
    return { query: state.text.join(''), query_params: state.params };
  }
}

function isSqlParam(slot: SqlSlot): slot is SqlParam {
  return PARAM_BRAND in slot;
}

export function isSqlFragment(value: unknown): value is SqlFragment {
  return value instanceof SqlFragment;
}

function render(fragment: SqlFragment, state: RenderState): void {
  for (const [index, literal] of fragment.strings.entries()) {
    state.text.push(literal);
    const slot = fragment.slots[index];
    if (!slot) {
      continue;
    }
    if (isSqlParam(slot)) {
      const name = `${PARAM_NAME_PREFIX}${state.nextIndex++}`;
      state.params[name] = slot.value;
      state.text.push(`{${name}:${slot.type}}`);
      continue;
    }
    render(slot, state);
  }
}

/** Accepts the raw-string form too, so `chQuery` keeps one code path. */
export function toStatement(query: string | SqlFragment): SqlStatement {
  return typeof query === 'string'
    ? { query, query_params: {} }
    : query.toStatement();
}

export class SqlIdentifierError extends Error {
  constructor(identifier: string, reason: string) {
    super(
      `Refusing to inline identifier ${JSON.stringify(identifier)}: ${reason}`
    );
    this.name = 'SqlIdentifierError';
  }
}

/**
 * Separators are a closed set on purpose: a free-form string here would be a
 * hole straight through the type-level guarantee.
 */
const SQL_JOIN_SEPARATORS = [
  ', ',
  ' AND ',
  ' OR ',
  ' UNION ALL ',
  ' ',
  '\n',
] as const;
export type SqlJoinSeparator = (typeof SQL_JOIN_SEPARATORS)[number];
const DEFAULT_JOIN_SEPARATOR: SqlJoinSeparator = ', ';

function param(type: SqlParamType, value: SqlParamValue): SqlParam {
  return { [PARAM_BRAND]: true, type, value };
}

function assertSafeIdentifier(
  identifier: string,
  allowed?: readonly string[]
): void {
  if (allowed && !allowed.includes(identifier)) {
    throw new SqlIdentifierError(identifier, 'not in the caller whitelist');
  }
  if (identifier.length === 0) {
    throw new SqlIdentifierError(identifier, 'empty');
  }
  if (identifier.length > IDENTIFIER_MAX_LENGTH) {
    throw new SqlIdentifierError(
      identifier,
      `longer than ${IDENTIFIER_MAX_LENGTH} characters`
    );
  }
  const parts = identifier.split('.');
  if (parts.length > IDENTIFIER_MAX_PARTS) {
    throw new SqlIdentifierError(
      identifier,
      `more than ${IDENTIFIER_MAX_PARTS} dot-separated parts`
    );
  }
  for (const part of parts) {
    if (!IDENTIFIER_PART_PATTERN.test(part)) {
      throw new SqlIdentifierError(
        identifier,
        `${JSON.stringify(part)} is not a bare identifier`
      );
    }
  }
}

/** UTC calendar day — a `Date` param is parsed as text, never as a timestamp. */
function toClickhouseDate(value: Date | string): string {
  return typeof value === 'string'
    ? value
    : value.toISOString().slice(0, ISO_DATE_LENGTH);
}

const EMPTY_FRAGMENT = new SqlFragment([''], []);

interface SqlBuilder {
  (strings: TemplateStringsArray, ...slots: SqlSlot[]): SqlFragment;

  /** A fragment that renders to nothing — the identity for conditionals. */
  readonly empty: SqlFragment;

  /** Escape hatch for a ClickHouse type this module has no shortcut for. */
  param(type: SqlParamType, value: SqlParamValue): SqlParam;

  string(value: string): SqlParam;
  uint64(value: number | bigint | string): SqlParam;
  float64(value: number): SqlParam;
  /** Text form only — ClickHouse rejects a unix timestamp for `Date`. */
  date(value: Date | string): SqlParam;
  dateTime64(value: Date | string | number, precision?: number): SqlParam;
  uuid(value: string): SqlParam;
  bool(value: boolean): SqlParam;
  array(itemType: SqlParamType, values: readonly SqlParamValue[]): SqlParam;
  map(
    keyType: SqlParamType,
    valueType: SqlParamType,
    value:
      | ReadonlyMap<string | number, SqlParamValue>
      | Record<string, SqlParamValue>
  ): SqlParam;
  nullable(innerType: SqlParamType, value: SqlParamValue): SqlParam;

  /**
   * Bind an identifier as `{name:Identifier}`. Server-side and safe, but not
   * accepted in every syntactic position — see the matrix in
   * `sql.clickhouse.test.ts`. Notably a qualified `table.column` must be two
   * separate params, or `sql.id`.
   */
  identifier(name: string): SqlParam;

  /**
   * Inline a validated identifier as SQL text, for the positions where
   * `{name:Identifier}` does not work. Throws on anything that is not a bare
   * (optionally once-qualified) identifier — it never falls back to
   * interpolating the input. Pass `allowed` wherever the call site has a
   * closed column set.
   */
  id(name: string, allowed?: readonly string[]): SqlFragment;

  join(
    fragments: readonly SqlFragment[],
    separator?: SqlJoinSeparator
  ): SqlFragment;
}

const tag = (strings: TemplateStringsArray, ...slots: SqlSlot[]): SqlFragment =>
  new SqlFragment(Array.from(strings), slots);

export const sql: SqlBuilder = Object.assign(tag, {
  empty: EMPTY_FRAGMENT,

  param,
  string: (value: string) => param('String', value),
  uint64: (value: number | bigint | string) => param('UInt64', value),
  float64: (value: number) => param('Float64', value),
  date: (value: Date | string) => param('Date', toClickhouseDate(value)),
  dateTime64: (
    value: Date | string | number,
    precision: number = DEFAULT_DATETIME64_PRECISION
  ) => param(`DateTime64(${precision})`, value),
  uuid: (value: string) => param('UUID', value),
  bool: (value: boolean) => param('Bool', value),
  array: (itemType: SqlParamType, values: readonly SqlParamValue[]) =>
    param(`Array(${itemType})`, values),
  map: (
    keyType: SqlParamType,
    valueType: SqlParamType,
    value:
      | ReadonlyMap<string | number, SqlParamValue>
      | Record<string, SqlParamValue>
  ) => param(`Map(${keyType},${valueType})`, value),
  nullable: (innerType: SqlParamType, value: SqlParamValue) =>
    param(`Nullable(${innerType})`, value),
  identifier: (name: string) => param('Identifier', name),

  id: (name: string, allowed?: readonly string[]): SqlFragment => {
    assertSafeIdentifier(name, allowed);
    return new SqlFragment([name], []);
  },

  join: (
    fragments: readonly SqlFragment[],
    separator: SqlJoinSeparator = DEFAULT_JOIN_SEPARATOR
  ): SqlFragment => {
    if (fragments.length === 0) {
      return EMPTY_FRAGMENT;
    }
    const strings = ['', ...fragments.slice(1).map(() => separator), ''];
    return new SqlFragment(strings, fragments);
  },
});

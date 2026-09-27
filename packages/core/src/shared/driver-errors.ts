// Postgres and ClickHouse failures that are really BAD INPUT, classified once
// so every transport answers the same way.
//
// Without this a malformed id reached the caller as a 500 carrying the
// driver's own words — Prisma's full invocation text, or a ClickHouse message
// that echoes the generated SQL including its scope clause (ISSUES.md H12).
//
// Both drivers label their failures, so nothing here parses a message:
// Prisma sets `code` to `P####`, and @clickhouse/client sets `code` to the
// numeric error and `type` to its name.

export interface DriverFailure {
  /** tRPC's code; the HTTP status follows from it. */
  trpc: 'BAD_REQUEST' | 'NOT_FOUND';
  status: number;
  /** Replaces the driver's message, which is not the caller's business. */
  message: string;
}

const BAD_REQUEST = 400;
const NOT_FOUND = 404;

/** https://www.prisma.io/docs/orm/reference/error-reference */
const PRISMA_FAILURES: Record<string, DriverFailure> = {
  // "Inconsistent column data" — what an `@db.Uuid` column raises for an id
  // that is not a UUID at all. It fires BEFORE any findUnique null check, so
  // procedures with a correct not-found guard still answered 500.
  P2023: {
    trpc: 'BAD_REQUEST',
    status: BAD_REQUEST,
    message: 'Malformed id',
  },
  // "An operation failed because it depends on one or more records that were
  // required but not found" — every `findUniqueOrThrow` miss.
  P2025: {
    trpc: 'NOT_FOUND',
    status: NOT_FOUND,
    message: 'Not found',
  },
};

/**
 * ClickHouse `type` values that can only come from caller input. Deliberately
 * a short allowlist: anything unlisted stays a 500, because a query bug must
 * not be reported to the caller as their mistake.
 */
const CLICKHOUSE_BAD_INPUT: Record<string, string> = {
  CANNOT_PARSE_UUID: 'Malformed id',
  CANNOT_PARSE_DATE: 'Malformed date',
  CANNOT_PARSE_DATETIME: 'Malformed date',
  CANNOT_PARSE_NUMBER: 'Malformed number',
  INVALID_WITH_FILL_EXPRESSION: 'Invalid date range',
};

function readLabels(error: unknown): { code?: string; type?: string } {
  if (typeof error !== 'object' || error === null) {
    return {};
  }
  const labelled = error as { code?: unknown; type?: unknown };
  return {
    code: typeof labelled.code === 'string' ? labelled.code : undefined,
    type: typeof labelled.type === 'string' ? labelled.type : undefined,
  };
}

/** `null` when the failure is not the caller's fault — leave those as 500s. */
export function classifyDriverError(error: unknown): DriverFailure | null {
  const { code, type } = readLabels(error);

  const prisma = code ? PRISMA_FAILURES[code] : undefined;
  if (prisma) {
    return prisma;
  }

  const clickhouse = type ? CLICKHOUSE_BAD_INPUT[type] : undefined;
  if (clickhouse) {
    return { trpc: 'BAD_REQUEST', status: BAD_REQUEST, message: clickhouse };
  }

  return null;
}

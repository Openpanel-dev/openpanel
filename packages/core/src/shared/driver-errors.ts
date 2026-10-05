// Postgres and ClickHouse failures that are really BAD INPUT, classified once so
// every transport answers the same way instead of a 500 carrying the driver's
// words (Prisma's invocation text, or ClickHouse's echo of the generated SQL).
//
// Both drivers label their failures, so nothing here parses a message: Prisma
// sets `code` to `P####`, and @clickhouse/client sets `code` to the numeric
// error and `type` to its name.

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
  // What an `@db.Uuid` column raises for a non-UUID id. It fires BEFORE any
  // findUnique null check, so a correct not-found guard never gets to run.
  P2023: {
    trpc: 'BAD_REQUEST',
    status: BAD_REQUEST,
    message: 'Malformed id',
  },
  // Every `findUniqueOrThrow` miss.
  P2025: {
    trpc: 'NOT_FOUND',
    status: NOT_FOUND,
    message: 'Not found',
  },
};

/**
 * ClickHouse `type` values that can only come from caller input. A short
 * allowlist: a query bug must not be reported as the caller's mistake.
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

/** `null` when the failure is not the caller's fault; those stay 500s. */
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

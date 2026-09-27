// Both drivers label their failures, so the classifier reads labels and never
// parses a message. The shapes below are what the real drivers throw — the
// ClickHouse ones were taken from live errors against the worktree database.

import { describe, expect, test } from 'bun:test';
import { classifyDriverError } from './driver-errors';

const prismaError = (code: string) =>
  Object.assign(new Error('Invalid `prisma.client.findUnique()` invocation'), {
    code,
  });

const clickhouseError = (code: string, type: string) =>
  Object.assign(
    new Error(
      'Cannot parse uuid nope: In scope SELECT count() FROM events WHERE project_id = ...'
    ),
    { code, type }
  );

describe('classifyDriverError', () => {
  test('a malformed id on a @db.Uuid column is a 400, not a 500', () => {
    expect(classifyDriverError(prismaError('P2023'))).toEqual({
      trpc: 'BAD_REQUEST',
      status: 400,
      message: 'Malformed id',
    });
  });

  test('a findUniqueOrThrow miss is a 404', () => {
    expect(classifyDriverError(prismaError('P2025'))).toEqual({
      trpc: 'NOT_FOUND',
      status: 404,
      message: 'Not found',
    });
  });

  test("ClickHouse parse failures are the caller's own input", () => {
    for (const [type, message] of [
      ['CANNOT_PARSE_UUID', 'Malformed id'],
      ['CANNOT_PARSE_DATETIME', 'Malformed date'],
      ['INVALID_WITH_FILL_EXPRESSION', 'Invalid date range'],
    ] as const) {
      expect([type, classifyDriverError(clickhouseError('376', type))]).toEqual(
        [type, { trpc: 'BAD_REQUEST', status: 400, message }]
      );
    }
  });

  test("the message never carries the driver's own words", () => {
    const failure = classifyDriverError(
      clickhouseError('376', 'CANNOT_PARSE_UUID')
    );
    expect(failure?.message).not.toContain('SELECT');
    expect(failure?.message).not.toContain('scope');
  });

  // A query bug must not be reported to the caller as their mistake.
  test('anything unrecognised stays a 500', () => {
    for (const unknown of [
      new Error('boom'),
      prismaError('P1001'),
      clickhouseError('241', 'MEMORY_LIMIT_EXCEEDED'),
      null,
      undefined,
      'a string',
      { code: 42 },
    ]) {
      expect(classifyDriverError(unknown)).toBeNull();
    }
  });
});

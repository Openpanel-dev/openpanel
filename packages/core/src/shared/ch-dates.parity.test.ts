// Guards the second duplication M10-009 introduced: core owns its own copies of
// @openpanel/db's ClickHouse date helpers (see ch-dates.ts's header for why),
// and a divergence would show up as silently wrong date literals in a query
// rather than as a failing test.
//
// This is a test file, which `core-uses-ctx-not-db-internals` exempts.

import { describe, expect, it } from 'bun:test';
import * as dbClient from '@openpanel/db/src/clickhouse/client';
import { convertClickhouseDateToJs, formatClickhouseDate } from './ch-dates';

const CASES = [
  new Date('2026-09-06T12:34:56.789Z'),
  new Date('2026-01-01T00:00:00.000Z'),
  new Date('1970-01-01T00:00:00.000Z'),
  '2026-09-06T23:59:59.999Z',
  '2026-02-28 08:00:00',
];

describe('ch-dates parity with @openpanel/db', () => {
  it('formats identically, with and without skipTime', () => {
    for (const input of CASES) {
      expect(formatClickhouseDate(input)).toBe(
        dbClient.formatClickhouseDate(input)
      );
      expect(formatClickhouseDate(input, true)).toBe(
        dbClient.formatClickhouseDate(input, true)
      );
    }
  });

  it('parses identically', () => {
    for (const input of CASES) {
      const formatted = formatClickhouseDate(input);
      expect(convertClickhouseDateToJs(formatted).toISOString()).toBe(
        dbClient.convertClickhouseDateToJs(formatted).toISOString()
      );
    }
  });
});

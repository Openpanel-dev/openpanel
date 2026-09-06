// Guards the one duplication M10-009 introduced: core owns its own copy of
// @openpanel/db's `TABLE_NAMES` (see ch-tables.ts's header for why), and a
// table added on one side only would otherwise be found by a failing query in
// production rather than by CI.
//
// This is a test file, which `core-uses-ctx-not-db-internals` exempts — the
// point of the rule is that core's REQUEST path carries `ctx.ch`, and a test
// has no request.

import { describe, expect, it } from 'bun:test';
import * as dbClient from '@openpanel/db/src/clickhouse/client';
import {
  getReplicatedTableName,
  isClickhouseClustered,
  TABLE_NAMES,
} from './ch-tables';

describe('ch-tables parity with @openpanel/db', () => {
  it('has exactly the same table map', () => {
    expect(TABLE_NAMES).toEqual(dbClient.TABLE_NAMES);
  });

  it('derives the same cluster verdict', () => {
    expect(isClickhouseClustered()).toBe(dbClient.isClickhouseClustered());
  });

  it('derives the same mutation table name', () => {
    for (const name of Object.values(TABLE_NAMES)) {
      expect(getReplicatedTableName(name)).toBe(
        dbClient.getReplicatedTableName(name)
      );
    }
  });
});

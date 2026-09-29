// Guards the one duplication this creates: core owns its own copy of
// @openpanel/db's `TABLE_NAMES` (see ch-tables.ts's header for why), and a
// table added on one side only would otherwise be found by a failing query in
// production rather than by CI.
//
// This is a test file, which `core-uses-ctx-not-db-internals` exempts — the
// point of the rule is that core's REQUEST path carries `ctx.ch`, and a test
// has no request.

import { describe, expect, it } from 'bun:test';
import * as dbClient from '@openpanel/db/src/clickhouse/client';
import { getReplicatedTableName, TABLE_NAMES } from './ch-tables';

describe('ch-tables parity with @openpanel/db', () => {
  it('has exactly the same table map', () => {
    expect(TABLE_NAMES).toEqual(dbClient.TABLE_NAMES);
  });

  // The cluster VERDICT is the config loader's (`config.clickhouseClustered` =
  // CLICKHOUSE_CLUSTER); @openpanel/db still reads it itself. Feeding db's
  // verdict in is what makes this a parity check of the NAME derivation
  // rather than of two env reads.
  it('derives the same mutation table name for the same verdict', () => {
    const clustered = dbClient.isClickhouseClustered();
    for (const name of Object.values(TABLE_NAMES)) {
      expect(getReplicatedTableName(clustered, name)).toBe(
        dbClient.getReplicatedTableName(name)
      );
    }
  });
});

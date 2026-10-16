// core keeps its own copy of @openpanel/db's `TABLE_NAMES`; this catches a table
// added on one side only in CI instead of as a failing production query.

import { describe, expect, it } from 'bun:test';
import * as dbClient from '@openpanel/db/src/clickhouse/client';
import { getReplicatedTableName, TABLE_NAMES } from './ch-tables';

describe('ch-tables parity with @openpanel/db', () => {
  it('has exactly the same table map', () => {
    expect(TABLE_NAMES).toEqual(dbClient.TABLE_NAMES);
  });

  // The cluster verdict is the config loader's; feeding db's verdict in makes
  // this a parity check of the NAME derivation, not of two env reads.
  it('derives the same mutation table name for the same verdict', () => {
    const clustered = dbClient.isClickhouseClustered();
    for (const name of Object.values(TABLE_NAMES)) {
      expect(getReplicatedTableName(clustered, name)).toBe(
        dbClient.getReplicatedTableName(name)
      );
    }
  });
});

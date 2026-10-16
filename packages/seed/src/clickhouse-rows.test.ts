// The row shapes are copied from core, not imported. This is what keeps them
// honest: every key the seed writes must be a column, and every column must
// be written, for the three tables it inserts into.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ARCHETYPES } from './archetypes';
import type {
  ClickhouseEventRow,
  ClickhouseProfileRow,
  ClickhouseSessionRow,
} from './clickhouse-rows';
import { generate } from './generator';
import { projectIdFor } from './ids';
import type { RowSink, SinkCounts } from './sink';

const SCHEMA_FILE = resolve(
  import.meta.dir,
  '..',
  '..',
  '..',
  'test',
  'clickhouse-schema.sql'
);

/** Column names of one `CREATE TABLE` in the flat schema; indexes and projections are skipped. */
function schemaColumns(table: string): Set<string> {
  const sql = readFileSync(SCHEMA_FILE, 'utf8');
  const start = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table}\n`);
  if (start < 0) {
    throw new Error(`${table} not in ${SCHEMA_FILE}`);
  }
  const body = sql.slice(start, sql.indexOf('\nENGINE', start));
  const columns = new Set<string>();
  for (const match of body.matchAll(/^\s+`([a-z_]+)`/gm)) {
    columns.add(match[1] ?? '');
  }
  return columns;
}

class CollectingSink implements RowSink {
  events: ClickhouseEventRow[] = [];
  sessions: ClickhouseSessionRow[] = [];
  profiles: ClickhouseProfileRow[] = [];
  addEvents(rows: readonly ClickhouseEventRow[]): void {
    this.events.push(...rows);
  }
  addSession(row: ClickhouseSessionRow): void {
    this.sessions.push(row);
  }
  addProfiles(rows: readonly ClickhouseProfileRow[]): void {
    this.profiles.push(...rows);
  }
  flushFull(): Promise<void> {
    return Promise.resolve();
  }
  flush(): Promise<void> {
    return Promise.resolve();
  }
  counts(): SinkCounts {
    return {
      events: this.events.length,
      sessions: this.sessions.length,
      profiles: this.profiles.length,
    };
  }
}

async function sampleRows(): Promise<CollectingSink> {
  const sink = new CollectingSink();
  await generate(
    {
      seed: 1,
      sessionsPerDay: 60,
      days: 1,
      now: new Date('2026-09-20T12:00:00.000Z'),
      variance: 1,
      projects: ARCHETYPES.map((archetype) => ({
        archetype,
        projectId: projectIdFor(archetype),
      })),
    },
    sink,
    () => undefined
  );
  return sink;
}

function keysOf(rows: readonly object[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      keys.add(key);
    }
  }
  return keys;
}

describe('seed rows match the ClickHouse schema', () => {
  for (const table of ['events', 'sessions', 'profiles'] as const) {
    test(table, async () => {
      const sink = await sampleRows();
      const written = keysOf(sink[table]);
      const columns = schemaColumns(table);
      expect([...written].sort()).toEqual([...columns].sort());
    });
  }
});

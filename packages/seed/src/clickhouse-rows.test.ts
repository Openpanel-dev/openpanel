// The row shapes are copied from core, not imported. This is what keeps them
// honest: every key the seed writes must be a column, and every column must
// be written, for the four tables it inserts into.

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ARCHETYPES } from './archetypes';
import type {
  ClickhouseAiEventRow,
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
  aiEvents: ClickhouseAiEventRow[] = [];
  sessions: ClickhouseSessionRow[] = [];
  profiles: ClickhouseProfileRow[] = [];
  addEvents(rows: readonly ClickhouseEventRow[]): void {
    this.events.push(...rows);
  }
  addAiEvents(rows: readonly ClickhouseAiEventRow[]): void {
    this.aiEvents.push(...rows);
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
      aiEvents: this.aiEvents.length,
      sessions: this.sessions.length,
      profiles: this.profiles.length,
    };
  }
}

async function sampleRows(
  overrides: { sessionsPerDay?: number; days?: number } = {}
): Promise<CollectingSink> {
  const sink = new CollectingSink();
  await generate(
    {
      seed: 1,
      sessionsPerDay: overrides.sessionsPerDay ?? 60,
      days: overrides.days ?? 1,
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

/** AI calls only come from activated SaaS users, so a day of traffic is too thin. */
const AI_SAMPLE = { sessionsPerDay: 400, days: 5 };

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
  const sinkKeyByTable = {
    events: 'events',
    ai_events: 'aiEvents',
    sessions: 'sessions',
    profiles: 'profiles',
  } as const;
  for (const table of [
    'events',
    'ai_events',
    'sessions',
    'profiles',
  ] as const) {
    test(table, async () => {
      const sink = await sampleRows(table === 'ai_events' ? AI_SAMPLE : {});
      const written = keysOf(sink[sinkKeyByTable[table]]);
      expect(written.size).toBeGreaterThan(0);
      const columns = schemaColumns(table);
      expect([...written].sort()).toEqual([...columns].sort());
    });
  }
});

describe('AI traces are trees the trace view can draw', () => {
  test('one root per trace, and every other span hangs off a span in its trace', async () => {
    const sink = await sampleRows(AI_SAMPLE);
    const traces = Map.groupBy(sink.aiEvents, (row) => row.trace_id);
    expect(traces.size).toBeGreaterThan(0);
    for (const rows of traces.values()) {
      const roots = rows.filter((row) => row.type === 'trace');
      expect(roots).toHaveLength(1);
      expect(roots[0]?.parent_id).toBe('');
      const spanIds = new Set(rows.map((row) => row.span_id));
      for (const row of rows) {
        if (row.type !== 'trace') {
          expect(spanIds.has(row.parent_id)).toBe(true);
        }
      }
    }
  });

  test('the root spans its children and carries no cost of its own', async () => {
    const sink = await sampleRows(AI_SAMPLE);
    const roots = sink.aiEvents.filter((row) => row.type === 'trace');
    for (const root of roots) {
      expect(root.total_cost).toBe(0);
      const children = sink.aiEvents.filter(
        (row) =>
          row.trace_id === root.trace_id && row.parent_id === root.span_id
      );
      const childMs = children.reduce((sum, row) => sum + row.latency_ms, 0);
      expect(root.latency_ms).toBe(childMs);
    }
  });
});

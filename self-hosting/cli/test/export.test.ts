import { afterEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { gunzipSync } from 'node:zlib';
import type { ClickHouse } from '../src/export/clickhouse';
import {
  type ExportOptions,
  runExport,
  validateOptions,
} from '../src/export/export';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const outDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'op-export-'));
  tempDirs.push(dir);
  return dir;
};

const options = (
  out: string,
  overrides: Partial<ExportOptions> = {}
): ExportOptions => ({
  out,
  database: 'openpanel',
  tables: ['events'],
  projectIds: [],
  rowsPerFile: 2,
  gzip: true,
  ...overrides,
});

const ignore = () => undefined;
const NO_PROGRESS = { onTable: ignore, onDay: ignore, onSkip: ignore };

// Answers the queries export issues and serves rows for the paged SELECTs.
const fakeClickHouse = (
  rows: string[],
  failStream = false
): { client: ClickHouse; sql: string[] } => {
  const sql: string[] = [];
  const client: ClickHouse = {
    query: async (query) => {
      sql.push(query);
      if (query.includes('system.tables')) {
        return '1';
      }
      if (query.includes('GROUP BY d')) {
        return `2026-08-17\t2026-08-18\t${rows.length}`;
      }
      if (query.includes('version()')) {
        return '26.1';
      }
      if (query.includes('groupUniqArray')) {
        return "['demo']";
      }
      return '1';
    },
    stream: (query) => {
      sql.push(query);
      const offset = Number(/OFFSET (\d+)/.exec(query)?.[1]);
      const page = rows
        .slice(offset, offset + 2)
        .map((row) => `${row}\n`)
        .join('');
      const output = Readable.from([page]);
      const done = failStream
        ? Promise.reject(new Error('clickhouse-client exited with 1'))
        : Promise.resolve();
      done.catch(ignore);
      return { output, done };
    },
  };
  return { client, sql };
};

describe('runExport', () => {
  test('pages a day into files of rowsPerFile and records what landed', async () => {
    const out = outDir();
    const { client } = fakeClickHouse([
      '{"id":"1"}',
      '{"id":"2"}',
      '{"id":"3"}',
    ]);

    const result = await runExport(client, options(out), NO_PROGRESS);

    expect(result.summaries).toEqual([{ table: 'events', rows: 3, files: 2 }]);
    expect(readdirSync(join(out, 'events')).sort()).toEqual([
      'events-2026-08-17-0000.jsonl.gz',
      'events-2026-08-17-0001.jsonl.gz',
    ]);
    const first = gunzipSync(
      readFileSync(join(out, 'events/events-2026-08-17-0000.jsonl.gz'))
    ).toString();
    expect(first).toBe('{"id":"1"}\n{"id":"2"}\n');

    const manifest = readFileSync(join(out, 'manifest.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(manifest).toEqual([
      {
        table: 'events',
        file: 'events-2026-08-17-0000.jsonl.gz',
        day: '2026-08-17',
        rows: 2,
      },
      {
        table: 'events',
        file: 'events-2026-08-17-0001.jsonl.gz',
        day: '2026-08-17',
        rows: 1,
      },
    ]);
    expect(
      JSON.parse(readFileSync(join(out, '_meta.json'), 'utf8')).tables
    ).toEqual({ events: { rows: 3, files: 2 } });
  });

  test('writes plain .jsonl with --no-gzip', async () => {
    const out = outDir();
    const { client } = fakeClickHouse(['{"id":"1"}']);
    await runExport(client, options(out, { gzip: false }), NO_PROGRESS);
    expect(readdirSync(join(out, 'events'))).toEqual([
      'events-2026-08-17-0000.jsonl',
    ]);
  });

  test('sessions use FINAL and a sign filter, groups a deleted filter', async () => {
    const { client, sql } = fakeClickHouse(['{"id":"1"}']);
    await runExport(
      client,
      options(outDir(), { tables: ['sessions', 'groups'] }),
      NO_PROGRESS
    );

    expect(
      sql.some(
        (query) =>
          query.includes('FROM sessions FINAL') &&
          query.includes('AND sign > 0')
      )
    ).toBe(true);
    expect(
      sql.some(
        (query) =>
          query.includes('FROM groups FINAL') &&
          query.includes('AND deleted = 0')
      )
    ).toBe(true);
  });

  test('filters reach the query', async () => {
    const { client, sql } = fakeClickHouse(['{"id":"1"}']);
    await runExport(
      client,
      options(outDir(), {
        projectIds: ['a', 'b'],
        from: '2026-08-01',
        to: '2026-09-01 12:00',
      }),
      NO_PROGRESS
    );

    const paged = sql.find((query) => query.includes('OFFSET')) as string;
    expect(paged).toContain("project_id IN ('a','b')");
    expect(paged).toContain("created_at >= toDateTime64('2026-08-01', 3)");
    expect(paged).toContain("created_at < toDateTime64('2026-09-01 12:00', 3)");
  });

  test('a failed query removes its partial file instead of leaving it for the importer', async () => {
    const out = outDir();
    const { client } = fakeClickHouse(['{"id":"1"}'], true);

    await expect(runExport(client, options(out), NO_PROGRESS)).rejects.toThrow(
      'exited with 1'
    );
    expect(
      existsSync(join(out, 'events/events-2026-08-17-0000.jsonl.gz'))
    ).toBe(false);
  });
});

describe('validateOptions', () => {
  const base = options('/tmp/x');

  test.each([
    ['project id', { projectIds: ["a') OR 1=1 --"] }],
    ['table name', { tables: ['events; DROP TABLE events'] }],
    ['--db', { database: 'open panel' }],
    ['--from', { from: "2026-08-01' OR 1=1" }],
    ['--rows-per-file', { rowsPerFile: 0 }],
  ])('rejects a bad %s', (_label, override) => {
    expect(() => validateOptions({ ...base, ...override })).toThrow('Invalid');
  });

  test('accepts dates with and without a time', () => {
    expect(() =>
      validateOptions({
        ...base,
        from: '2026-08-01',
        to: '2026-08-16 12:00:30',
      })
    ).not.toThrow();
  });
});

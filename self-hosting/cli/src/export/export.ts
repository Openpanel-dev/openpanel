import { createWriteStream } from 'node:fs';
import { appendFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import type { ClickHouse } from './clickhouse';

export const DEFAULT_TABLES = [
  'events',
  'sessions',
  'profiles',
  'groups',
] as const;
export const DEFAULT_ROWS_PER_FILE = 100_000;

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PROJECT_ID = /^[A-Za-z0-9_-]+$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;
const NEWLINE = 0x0a;

export interface ExportOptions {
  out: string;
  database: string;
  tables: string[];
  projectIds: string[];
  from?: string;
  to?: string;
  rowsPerFile: number;
  gzip: boolean;
}

export interface TableSummary {
  table: string;
  rows: number;
  files: number;
}

export interface ExportProgress {
  onTable: (table: string) => void;
  onDay: (day: string, rows: number) => void;
  onSkip: (table: string) => void;
}

// Everything here ends up inside SQL, so it is checked rather than escaped.
export const validateOptions = (options: ExportOptions): void => {
  const bad = (what: string, value: string) => {
    throw new Error(`Invalid ${what}: "${value}"`);
  };
  if (!IDENTIFIER.test(options.database)) {
    bad('--db', options.database);
  }
  for (const table of options.tables) {
    if (!IDENTIFIER.test(table)) {
      bad('table name', table);
    }
  }
  for (const id of options.projectIds) {
    if (!PROJECT_ID.test(id)) {
      bad('project id', id);
    }
  }
  for (const [flag, value] of [
    ['--from', options.from],
    ['--to', options.to],
  ] as const) {
    if (value && !TIMESTAMP.test(value)) {
      bad(`${flag} (use "YYYY-MM-DD" or "YYYY-MM-DD HH:MM[:SS]")`, value);
    }
  }
  if (!Number.isInteger(options.rowsPerFile) || options.rowsPerFile < 1) {
    bad('--rows-per-file', String(options.rowsPerFile));
  }
};

// `country` is a LowCardinality(FixedString(2)) that JSON-encodes empty values
// as NULs; normalise them so the JSONL stays clean.
const COUNTRY_FIX =
  "* EXCEPT (country), replaceAll(toString(country), '\\0', '') AS country";

interface TableRules {
  select: string;
  from: (table: string) => string;
  extra: string;
  order: string;
  dateColumn: string;
}

// sessions / profiles / groups are Replacing- or CollapsingMergeTree tables, so
// they need FINAL (and a sign/deleted filter) to yield one current row each.
export const rulesFor = (table: string): TableRules => ({
  select: table === 'events' || table === 'sessions' ? COUNTRY_FIX : '*',
  from: (name) =>
    ['sessions', 'profiles', 'groups'].includes(name) ? `${name} FINAL` : name,
  extra:
    table === 'sessions'
      ? 'AND sign > 0'
      : table === 'groups'
        ? 'AND deleted = 0'
        : '',
  // Deterministic tiebreaker so LIMIT/OFFSET paging never skips or repeats a row.
  order:
    table === 'session_replay_chunks'
      ? 'started_at, session_id, chunk_index'
      : 'created_at, id',
  dateColumn: table === 'session_replay_chunks' ? 'started_at' : 'created_at',
});

const whereClause = (options: ExportOptions, rules: TableRules): string => {
  const project =
    options.projectIds.length > 0
      ? `project_id IN ('${options.projectIds.join("','")}')`
      : '1';
  const range = [
    options.from
      ? ` AND ${rules.dateColumn} >= toDateTime64('${options.from}', 3)`
      : '',
    options.to
      ? ` AND ${rules.dateColumn} < toDateTime64('${options.to}', 3)`
      : '',
  ].join('');
  return `WHERE ${project} ${rules.extra}${range}`;
};

const countNewlines = (counter: { lines: number }) =>
  new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      for (const byte of chunk) {
        if (byte === NEWLINE) {
          counter.lines++;
        }
      }
      callback(null, chunk);
    },
  });

// Counts what actually landed rather than what the counting pass predicted: on a
// live system they differ, and a stale estimate would make the verifier cry wolf.
// A failed write removes its file, since the importer reads the directory, not
// the manifest, and would treat a truncated file as complete.
const writeQuery = async (
  client: ClickHouse,
  sql: string,
  file: string,
  gzip: boolean
): Promise<number> => {
  const counter = { lines: 0 };
  const { output, done } = client.stream(sql);
  try {
    await Promise.all([
      pipeline(
        output,
        countNewlines(counter),
        ...(gzip ? [createGzip()] : []),
        createWriteStream(file)
      ),
      done,
    ]);
  } catch (error) {
    await rm(file, { force: true });
    throw error;
  }
  return counter.lines;
};

const exportTable = async (
  client: ClickHouse,
  options: ExportOptions,
  table: string,
  manifest: string,
  progress: ExportProgress
): Promise<TableSummary> => {
  const rules = rulesFor(table);
  const from = rules.from(table);
  const where = whereClause(options, rules);
  const tableDir = join(options.out, table);
  await mkdir(tableDir, { recursive: true });

  // One pass to learn each day's row count, then page through the days.
  // Day-sized windows keep OFFSET tiny, so paging stays cheap.
  const days = await client.query(
    `SELECT toDate(${rules.dateColumn}) AS d, toDate(${rules.dateColumn}) + 1 AS d_next, count() AS c
     FROM ${from} ${where} GROUP BY d HAVING c > 0 ORDER BY d`
  );

  let rows = 0;
  let files = 0;
  for (const line of days.split('\n').filter(Boolean)) {
    const [day = '', nextDay = '', dayRowsText = '0'] = line.split('\t');
    const dayRows = Number(dayRowsText);
    let dayWritten = 0;
    for (
      let offset = 0, part = 0;
      offset < dayRows;
      offset += options.rowsPerFile, part++
    ) {
      const name = `${table}-${day}-${String(part).padStart(4, '0')}.jsonl${options.gzip ? '.gz' : ''}`;
      const written = await writeQuery(
        client,
        `SELECT ${rules.select}
         FROM ${from}
         ${where}
           AND ${rules.dateColumn} >= toDateTime64('${day}', 3)
           AND ${rules.dateColumn} <  toDateTime64('${nextDay}', 3)
         ORDER BY ${rules.order}
         LIMIT ${options.rowsPerFile} OFFSET ${offset}
         FORMAT JSONEachRow`,
        join(tableDir, name),
        options.gzip
      );
      await appendFile(
        manifest,
        `${JSON.stringify({ table, file: name, day, rows: written })}\n`
      );
      dayWritten += written;
      files++;
    }
    rows += dayWritten;
    progress.onDay(day, dayWritten);
  }
  return { table, rows, files };
};

export const runExport = async (
  client: ClickHouse,
  options: ExportOptions,
  progress: ExportProgress
) => {
  validateOptions(options);
  await client.query('SELECT 1');
  await mkdir(options.out, { recursive: true });
  const manifest = join(options.out, 'manifest.jsonl');
  await writeFile(manifest, '');

  const clickhouseVersion = await client.query('SELECT version()');
  const summaries: TableSummary[] = [];
  for (const table of options.tables) {
    const exists = await client.query(
      `SELECT count() FROM system.tables WHERE database = '${options.database}' AND name = '${table}'`
    );
    if (exists === '0') {
      progress.onSkip(table);
      continue;
    }
    progress.onTable(table);
    summaries.push(
      await exportTable(client, options, table, manifest, progress)
    );
  }

  const projectFilter =
    options.projectIds.length > 0
      ? `project_id IN ('${options.projectIds.join("','")}')`
      : '1';
  const projectIds = await client
    .query(
      `SELECT groupUniqArray(project_id) FROM events WHERE ${projectFilter}`
    )
    .catch(() => '');

  await writeFile(
    join(options.out, '_meta.json'),
    `${JSON.stringify(
      {
        exported_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        clickhouse_version: clickhouseVersion,
        database: options.database,
        project_id_filter: options.projectIds.join(','),
        from: options.from ?? '',
        to: options.to ?? '',
        project_ids_in_events: projectIds,
        tables: Object.fromEntries(
          summaries.map(({ table, rows, files }) => [table, { rows, files }])
        ),
      },
      null,
      2
    )}\n`
  );
  return { clickhouseVersion, projectIds, summaries, manifest };
};

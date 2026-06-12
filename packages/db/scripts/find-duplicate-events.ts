/**
 * find-duplicate-events.ts
 *
 * Reports (and optionally deletes) duplicate rows in the ClickHouse `events`
 * table. A "duplicate" is two or more rows that are logically the same event
 * but have different `id`s — the signature of the event being processed more
 * than once (see the Kafka consumer offset-handling fix).
 *
 * Duplicates are matched by a content hash over the meaningful columns
 * (everything that identifies the event, excluding `id`), so genuinely
 * distinct events are never grouped together — only byte-identical rows.
 *
 * Usage (always dry-run unless --danger-yes-delete is passed):
 *
 *   pnpm --filter @openpanel/db duplicate-events                 # last 24h, per day
 *   pnpm --filter @openpanel/db duplicate-events --since=7d --bucket=day
 *   pnpm --filter @openpanel/db duplicate-events --since=2026-06-01 --bucket=hour
 *   pnpm --filter @openpanel/db duplicate-events --project=my-project
 *   pnpm --filter @openpanel/db duplicate-events --since=48h --danger-yes-delete
 *
 * Flags:
 *   --since=<24h|7d|ISO>   Lookback window (default: 24h)
 *   --bucket=<day|hour>    Reporting granularity (default: day)
 *   --project=<projectId>  Restrict to a single project (default: all)
 *   --limit=<n>            Max example duplicate groups to print (default: 20)
 *   --batch=<n>            Ids per DELETE statement when deleting (default: 10000)
 *   --danger-yes-delete    Actually delete the extra rows. Keeps the lowest `id`
 *                          per duplicate group, deletes the rest. Without this
 *                          flag the script only reports.
 */
import {
  TABLE_NAMES,
  ch,
  getReplicatedTableName,
} from '../src/clickhouse/client';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

type Bucket = 'day' | 'hour';

interface Args {
  since: Date;
  bucket: Bucket;
  project: string | null;
  limit: number;
  batch: number;
  delete: boolean;
}

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((a) => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseSince(raw: string): Date {
  const relative = raw.match(/^(\d+)([hd])$/);
  if (relative) {
    const amount = Number.parseInt(relative[1]!, 10);
    const unitMs = relative[2] === 'h' ? 3600_000 : 86_400_000;
    return new Date(Date.now() - amount * unitMs);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `Invalid --since="${raw}". Use e.g. 24h, 7d, or an ISO date like 2026-06-01.`
    );
  }
  return parsed;
}

function parseArgs(): Args {
  const bucket = (getArg('bucket') ?? 'day') as Bucket;
  if (bucket !== 'day' && bucket !== 'hour') {
    throw new Error(`Invalid --bucket="${bucket}". Use day or hour.`);
  }
  return {
    since: parseSince(getArg('since') ?? '24h'),
    bucket,
    project: getArg('project') ?? null,
    limit: Number.parseInt(getArg('limit') ?? '20', 10),
    // Ids are inlined into `id IN (...)`. ~39 bytes/uuid, so 5000 ≈ 195KB stays
    // safely under ClickHouse's default max_query_size (256KB).
    batch: Number.parseInt(getArg('batch') ?? '5000', 10),
    delete: hasFlag('danger-yes-delete'),
  };
}

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

// Format a JS Date as a ClickHouse DateTime64(3) literal (UTC).
function chDateTime(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '').slice(0, 23);
}

// Content hash identifying a logical event (everything but `id`). Properties
// are normalized to a canonical, order-independent "key=value" list so map
// ordering can never split an otherwise-identical pair. char(0)/char(1) are
// used as separators because they cannot appear in the textual values.
const DEDUP_KEY = `cityHash64(
  project_id, name, profile_id, device_id, session_id,
  toString(created_at),
  path, origin, referrer, referrer_name, referrer_type,
  country, city, region, os, os_version, browser, browser_version,
  device, brand, model, sdk_name, sdk_version,
  toString(revenue), toString(duration),
  arrayStringConcat(
    arraySort(
      arrayMap(
        (k, v) -> concat(k, char(0), v),
        mapKeys(properties), mapValues(properties)
      )
    ),
    char(1)
  )
)`;

function projectClause(project: string | null): string {
  return project ? ` AND project_id = '${project.replace(/'/g, "''")}'` : '';
}

async function query<T>(sql: string): Promise<T[]> {
  return ch
    .query({ query: sql, format: 'JSONEachRow' })
    .then((res) => res.json<T>());
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

async function report(args: Args): Promise<void> {
  const bucketFn = args.bucket === 'day' ? 'toStartOfDay' : 'toStartOfHour';
  const sinceLiteral = chDateTime(args.since);
  const where = `created_at >= '${sinceLiteral}'${projectClause(args.project)}`;

  console.log(
    `\nScanning ${TABLE_NAMES.events} since ${sinceLiteral} UTC` +
      (args.project ? ` (project=${args.project})` : '') +
      `, bucketed by ${args.bucket}\n`
  );

  const rows = await query<{
    bucket: string;
    total_rows: string;
    unique_rows: string;
    duplicate_rows: string;
  }>(`
    SELECT
      ${bucketFn}(created_at) AS bucket,
      count() AS total_rows,
      uniqExact(${DEDUP_KEY}) AS unique_rows,
      count() - uniqExact(${DEDUP_KEY}) AS duplicate_rows
    FROM ${TABLE_NAMES.events}
    WHERE ${where}
    GROUP BY bucket
    ORDER BY bucket
  `);

  if (rows.length === 0) {
    console.log('No events found in this window.');
    return;
  }

  let totalRows = 0;
  let totalDupes = 0;
  console.table(
    rows.map((r) => {
      const total = Number(r.total_rows);
      const dupes = Number(r.duplicate_rows);
      totalRows += total;
      totalDupes += dupes;
      return {
        bucket: r.bucket,
        total: total.toLocaleString(),
        duplicates: dupes.toLocaleString(),
        pct: total > 0 ? `${((dupes / total) * 100).toFixed(2)}%` : '0%',
      };
    })
  );
  console.log(
    `\nTotal: ${totalRows.toLocaleString()} rows, ` +
      `${totalDupes.toLocaleString()} duplicate rows ` +
      `(${totalRows > 0 ? ((totalDupes / totalRows) * 100).toFixed(2) : '0'}%)\n`
  );

  // Top example groups, so it's clear *what* is duplicating.
  // Note: SELECT aliases must NOT shadow real column names — ClickHouse
  // resolves identifiers in WHERE/GROUP BY against SELECT aliases first, so an
  // alias named `project_id`/`created_at`/etc. (all referenced inside DEDUP_KEY
  // in GROUP BY, and in WHERE) turns into an aggregate-in-GROUP-BY/WHERE error.
  // Hence the de-shadowed alias names below.
  const examples = await query<{
    proj: string;
    event_name: string;
    profile: string;
    first_seen: string;
    occurrences: string;
    ids: string[];
  }>(`
    SELECT
      any(project_id) AS proj,
      any(name) AS event_name,
      any(profile_id) AS profile,
      toString(min(created_at)) AS first_seen,
      count() AS occurrences,
      arraySlice(groupArray(id), 1, 5) AS ids
    FROM ${TABLE_NAMES.events}
    WHERE ${where}
    GROUP BY ${DEDUP_KEY}
    HAVING occurrences > 1
    ORDER BY occurrences DESC
    LIMIT ${args.limit}
  `);

  if (examples.length > 0) {
    console.log(`Top ${examples.length} duplicate groups:`);
    console.table(
      examples.map((e) => ({
        project: e.proj,
        name: e.event_name,
        profile: e.profile,
        created_at: e.first_seen,
        copies: e.occurrences,
        sample_ids: e.ids.join(', '),
      }))
    );
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

function* bucketRanges(
  since: Date,
  bucket: Bucket
): Generator<{ start: Date; end: Date }> {
  const stepMs = bucket === 'day' ? 86_400_000 : 3600_000;
  // Align the first bucket to the start of the day/hour.
  const start = new Date(since);
  if (bucket === 'day') {
    start.setUTCHours(0, 0, 0, 0);
  } else {
    start.setUTCMinutes(0, 0, 0);
  }
  const now = Date.now();
  for (let t = start.getTime(); t < now; t += stepMs) {
    yield { start: new Date(t), end: new Date(t + stepMs) };
  }
}

async function deleteDuplicates(args: Args): Promise<void> {
  const target = getReplicatedTableName(TABLE_NAMES.events);
  console.log(
    `\n⚠️  DELETE MODE — keeping the lowest id per group, deleting the rest.\n` +
      `   Target: ${target}\n` +
      `   Note: ClickHouse mutations run asynchronously; rows disappear once the\n` +
      `   mutation completes server-side.\n`
  );

  let grandTotal = 0;
  for (const range of bucketRanges(args.since, args.bucket)) {
    const startLiteral = chDateTime(range.start);
    const endLiteral = chDateTime(range.end);
    const where =
      `created_at >= '${startLiteral}' AND created_at < '${endLiteral}'` +
      projectClause(args.project);

    // Extra rows = every row in a duplicate group except the lowest id.
    const extras = await query<{ id: string }>(`
      SELECT id FROM (
        SELECT id, row_number() OVER (
          PARTITION BY ${DEDUP_KEY} ORDER BY id ASC
        ) AS rn
        FROM ${TABLE_NAMES.events}
        WHERE ${where}
      ) WHERE rn > 1
    `);

    if (extras.length === 0) {
      continue;
    }

    const ids = extras.map((e) => e.id);
    console.log(
      `${startLiteral} → ${ids.length.toLocaleString()} duplicate rows to delete`
    );
    grandTotal += ids.length;

    for (let i = 0; i < ids.length; i += args.batch) {
      const slice = ids.slice(i, i + args.batch);
      const idList = slice.map((id) => `'${id}'`).join(',');
      // Scope the mutation to this bucket's time range so it only touches the
      // relevant monthly partition (and the primary index, when --project is
      // set) instead of scanning all history — `id` alone is not in the sort
      // key, so an unbounded `id IN (...)` mutates every partition.
      await ch.command({
        query:
          `ALTER TABLE ${target} DELETE WHERE ` +
          `created_at >= '${startLiteral}' AND created_at < '${endLiteral}'` +
          `${projectClause(args.project)} AND id IN (${idList})`,
      });
      // Avoid piling up mutations.
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  console.log(
    `\nSubmitted deletes for ${grandTotal.toLocaleString()} duplicate rows.\n` +
      `Watch system.mutations for completion:\n` +
      `  SELECT * FROM system.mutations WHERE is_done = 0\n`
  );
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();
  await report(args);

  if (args.delete) {
    await deleteDuplicates(args);
  } else {
    console.log(
      'Dry run only. Re-run with --danger-yes-delete to remove the duplicates.\n'
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

#!/usr/bin/env node
/**
 * Import an `export-for-cloud.sh` dump into another OpenPanel ClickHouse.
 *
 * Runs on plain Node (>= 18), no dependencies.
 *
 *   node import-to-cloud.mjs \
 *     --dir ./op-export \
 *     --url https://user:pass@ch.example.com:8443 \
 *     --db openpanel \
 *     --map <old_project_id>=<new_project_id>
 *
 * Flags:
 *   --dir <path>        Export directory (default ./op-export)
 *   --url <url>         ClickHouse HTTP endpoint, credentials inline or via --user/--password.
 *                       The database may be the URL path, matching OpenPanel's own
 *                       CLICKHOUSE_URL format: https://user:pass@host:8443/openpanel
 *   --db <name>         Target database. Overrides the URL path. Defaults to the
 *                       path, then to "openpanel".
 *   --map old=new       Rewrite project_id. Repeatable. Required unless --no-map.
 *   --no-map            Keep every project_id as-is and import everything
 *   --tables a,b        Only import these tables
 *   --batch 50000       Rows per INSERT
 *   --dry-run           Parse and count, insert nothing
 *
 * The mapping doubles as a filter: a row whose project_id has no --map entry is
 * dropped, not passed through with its original id. That keeps stray projects
 * out of the destination, and means `--map` is the single place that decides
 * both what moves and what it is called on the other side. Everything dropped
 * is counted and reported per project, so nothing disappears silently. Use
 * --no-map to import every project untouched.
 *
 * Re-runnable: every finished file is recorded in
 * <dir>/.import-state-<target-fingerprint>, and already-imported files are
 * skipped. ClickHouse MergeTree does not dedupe on insert, so do not delete
 * that file between runs against the same target. The fingerprint covers host,
 * database and the mapping itself, so changing any of them starts a fresh
 * state rather than silently skipping files the previous mapping had filtered.
 */
import { createReadStream, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import path from 'node:path';

const IMPORT_ORDER = [
  'profiles',
  'groups',
  'sessions',
  'events',
  'session_replay_chunks',
];

const CH_SETTINGS = {
  // The self-hosted schema may be slightly ahead of / behind the target.
  input_format_skip_unknown_fields: 1,
  date_time_input_format: 'best_effort',
  async_insert: 0,
  wait_for_async_insert: 1,
};

function parseArgs(argv) {
  const args = {
    dir: './op-export',
    db: null,
    batch: 50_000,
    map: new Map(),
    tables: null,
    dryRun: false,
    noMap: false,
    url: process.env.CLICKHOUSE_URL ?? '',
    user: '',
    password: '',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--dir') args.dir = next();
    else if (arg === '--url') args.url = next();
    else if (arg === '--db') args.db = next();
    else if (arg === '--user') args.user = next();
    else if (arg === '--password') args.password = next();
    else if (arg === '--batch') args.batch = Number.parseInt(next(), 10);
    else if (arg === '--tables') args.tables = next().split(',');
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--no-map') args.noMap = true;
    else if (arg === '--map') {
      const [from, to] = next().split('=');
      if (!from || !to) throw new Error('--map expects <old>=<new>');
      args.map.set(from, to);
    } else throw new Error(`Unknown flag: ${arg}`);
  }
  if (!args.url) throw new Error('Missing --url (or CLICKHOUSE_URL)');
  if (!args.noMap && args.map.size === 0) {
    throw new Error('Pass --map <old>=<new> to remap project_id, or --no-map to keep it');
  }

  // OpenPanel writes CLICKHOUSE_URL as http://host:8123/openpanel, so accept the
  // database in the path. ClickHouse's HTTP interface does NOT understand that
  // form — it answers "There is no handle /openpanel" — the client library just
  // rewrites it to ?database=. Do the same here, then blank the path.
  const parsed = new URL(args.url);
  const pathDb = parsed.pathname.replace(/^\/+|\/+$/g, '');
  if (args.db && pathDb && args.db !== pathDb) {
    console.warn(
      `⚠️  --db "${args.db}" overrides the database "${pathDb}" in the URL path`,
    );
  }
  args.db = args.db ?? (pathDb || 'openpanel');
  parsed.pathname = '/';
  args.url = parsed.toString();

  return args;
}

async function insert(args, table, rows) {
  if (args.dryRun || rows.length === 0) return;

  const url = new URL(args.url);
  if (args.user) url.username = args.user;
  if (args.password) url.password = args.password;

  const headers = { 'Content-Type': 'application/json' };
  if (url.username || url.password) {
    headers.Authorization = `Basic ${Buffer.from(
      `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`,
    ).toString('base64')}`;
    url.username = '';
    url.password = '';
  }

  url.searchParams.set('database', args.db);
  url.searchParams.set('query', `INSERT INTO ${table} FORMAT JSONEachRow`);
  for (const [key, value] of Object.entries(CH_SETTINGS)) {
    url.searchParams.set(key, String(value));
  }

  const body = `${rows.join('\n')}\n`;

  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { method: 'POST', headers, body });
    if (res.ok) return;
    const text = await res.text();
    // 4xx means the payload is wrong — retrying will not help.
    if (res.status < 500 || attempt === 5) {
      throw new Error(`INSERT INTO ${table} failed (${res.status}): ${text.slice(0, 800)}`);
    }
    console.warn(`   ⚠️  ${res.status} on ${table}, retry ${attempt}/4`);
    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
  }
}

const backfilled = { last_seen_at: 0 };
const importedByProject = new Map();
const droppedByProject = new Map();

const bump = (counter, key) => counter.set(key, (counter.get(key) ?? 0) + 1);

/** Returns the rewritten JSON line, or null when the row should be dropped. */
function remapLine(line, table, args) {
  const row = JSON.parse(line);
  const source = row.project_id;

  if (args.noMap) {
    bump(importedByProject, source);
  } else {
    const mapped = args.map.get(source);
    if (mapped === undefined) {
      bump(droppedByProject, source);
      return null;
    }
    row.project_id = mapped;
    bump(importedByProject, source);
  }

  // A collapsed session export only contains live rows.
  if (table === 'sessions') row.sign = 1;

  // A self-hosted install older than the 20260504 profiles restructure has no
  // `last_seen_at`. The target column is the ReplacingMergeTree version and has
  // no DEFAULT, so an absent value would land as 1970-01-01 and break both
  // dedup ordering and every "last seen" report. Seed it from `created_at`,
  // which is exactly what 16-restructure-profiles.ts does.
  if (table === 'profiles' && row.last_seen_at === undefined) {
    row.last_seen_at = row.created_at;
    backfilled.last_seen_at++;
  }

  return JSON.stringify(row);
}

async function importFile(args, table, file, state) {
  const key = `${table}/${path.basename(file)}`;
  if (state.has(key)) {
    console.log(`   ⏭️  ${path.basename(file)} (already imported)`);
    return 0;
  }

  const stream = file.endsWith('.gz')
    ? createReadStream(file).pipe(createGunzip())
    : createReadStream(file);
  const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });

  let batch = [];
  let total = 0;
  let dropped = 0;

  for await (const line of lines) {
    if (!line.trim()) continue;
    const row = remapLine(line, table, args);
    if (row === null) {
      dropped++;
      continue;
    }
    batch.push(row);
    total++;
    if (batch.length >= args.batch) {
      await insert(args, table, batch);
      batch = [];
    }
  }
  await insert(args, table, batch);

  if (!args.dryRun) appendFileSync(state.file, `${key}\n`);
  state.add(key);
  const suffix = dropped > 0 ? ` (${dropped} dropped — unmapped project)` : '';
  console.log(`   ✅ ${path.basename(file)} — ${total} rows${suffix}`);
  return total;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Key the resume state to the destination. Sharing one state file across
  // targets means a dry run against staging would make the real import skip
  // every file and report success without writing anything.
  const target = new URL(args.url);
  console.log(`🎯 Target: ${target.origin} — database "${args.db}"\n`);
  const mappingKey = args.noMap
    ? 'no-map'
    : [...args.map.entries()]
        .map(([from, to]) => `${from}=${to}`)
        .sort()
        .join(',');
  // Keyed on the resolved database, so /openpanel in the path and --db openpanel
  // are the same target and resume each other rather than starting over.
  const fingerprint = createHash('sha256')
    .update(`${target.host}|${args.db}|${mappingKey}`)
    .digest('hex')
    .slice(0, 12);
  const stateFile = path.join(args.dir, `.import-state-${fingerprint}`);
  const state = new Set(
    existsSync(stateFile)
      ? readFileSync(stateFile, 'utf8').split('\n').filter(Boolean)
      : [],
  );
  state.file = stateFile;

  const metaPath = path.join(args.dir, '_meta.json');
  if (existsSync(metaPath)) {
    console.log(`📄 ${readFileSync(metaPath, 'utf8').trim()}\n`);
  }
  if (args.dryRun) console.log('🧪 Dry run — nothing will be written\n');

  const totals = {};
  for (const table of IMPORT_ORDER) {
    if (args.tables && !args.tables.includes(table)) continue;
    const dir = path.join(args.dir, table);
    if (!existsSync(dir)) continue;

    const files = (await readdir(dir)).filter((f) => f.includes('.jsonl')).sort();
    if (files.length === 0) continue;

    console.log(`▶️  ${table} (${files.length} files)`);
    let rows = 0;
    for (const file of files) {
      rows += await importFile(args, table, path.join(dir, file), state);
    }
    totals[table] = rows;
    console.log(`   ${table}: ${rows} rows\n`);
  }

  console.log('🎉 Done.');
  for (const [table, rows] of Object.entries(totals)) {
    console.log(`   ${table.padEnd(16)} ${String(rows).padStart(10)} rows`);
  }

  if (importedByProject.size > 0) {
    console.log('\n   Imported by project:');
    for (const [source, rows] of [...importedByProject].sort((a, b) => b[1] - a[1])) {
      const dest = args.noMap ? source : args.map.get(source);
      console.log(`     ${source} → ${dest}`.padEnd(58) + `${String(rows).padStart(10)} rows`);
    }
  }

  if (droppedByProject.size > 0) {
    console.log('\n   Ignored (no --map entry):');
    for (const [source, rows] of [...droppedByProject].sort((a, b) => b[1] - a[1])) {
      console.log(`     ${source}`.padEnd(58) + `${String(rows).padStart(10)} rows`);
    }
  }

  // Every row filtered out is almost always a typo in --map rather than intent.
  if (importedByProject.size === 0 && droppedByProject.size > 0) {
    console.error(
      '\n❌ Every row was dropped — no project_id in the export matched a --map entry.',
    );
    console.error('   Check _meta.json for the exact source project ids.');
    process.exit(1);
  }
  if (backfilled.last_seen_at > 0) {
    console.log(
      `\nℹ️  Seeded last_seen_at from created_at for ${backfilled.last_seen_at} profiles`,
    );
    console.log(
      '   (source install predates the 20260504 profiles restructure — see',
    );
    console.log(
      '   16-restructure-profiles.ts for the optional events-derived backfill)',
    );
  }
}

main().catch((error) => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});

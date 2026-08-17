#!/usr/bin/env node
/**
 * Verify an export directory against its manifest before importing it.
 *
 * Catches the two things that actually go wrong: a file that never finished
 * transferring (truncated gzip) and a file that is silently missing.
 *
 *   node verify-export.mjs ./op-export
 *
 * Exits non-zero if anything is wrong, so it chains: `node verify-export.mjs
 * ./op-export && node import-to-cloud.mjs --dir ./op-export ...`
 */
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import path from 'node:path';

const dir = process.argv[2] ?? './op-export';
const manifestPath = path.join(dir, 'manifest.jsonl');

if (!existsSync(manifestPath)) {
  console.error(`❌ No manifest.jsonl in ${dir} — is that the export directory?`);
  process.exit(1);
}

async function countRows(file) {
  const stream = file.endsWith('.gz')
    ? createReadStream(file).pipe(createGunzip())
    : createReadStream(file);
  const lines = createInterface({ input: stream, crlfDelay: Number.POSITIVE_INFINITY });
  let rows = 0;
  for await (const line of lines) {
    if (line.trim()) rows++;
  }
  return rows;
}

const entries = readFileSync(manifestPath, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const problems = [];
const notes = [];
const totals = {};
let checked = 0;

for (const entry of entries) {
  const file = path.join(dir, entry.table, entry.file);

  if (!existsSync(file)) {
    problems.push(`MISSING   ${entry.table}/${entry.file}`);
    continue;
  }

  let rows;
  try {
    rows = await countRows(file);
  } catch (error) {
    // An interrupted transfer shows up here as an unexpected end of stream.
    problems.push(`CORRUPT   ${entry.table}/${entry.file} — ${error.message}`);
    continue;
  }

  // Fewer rows than expected means the file was cut short. More rows means
  // traffic arrived between the export's counting pass and its reading pass —
  // the file is complete, the manifest's estimate was just stale. Only the
  // first case is a problem.
  if (rows < entry.rows) {
    problems.push(
      `TRUNCATED ${entry.table}/${entry.file} — manifest says ${entry.rows}, file has ${rows}`,
    );
    continue;
  }

  if (rows > entry.rows) {
    notes.push(
      `${entry.table}/${entry.file} — ${rows - entry.rows} row(s) beyond the manifest (written while the export ran)`,
    );
  }

  totals[entry.table] = (totals[entry.table] ?? 0) + rows;
  checked++;
}

console.log(`Checked ${checked}/${entries.length} files in ${dir}\n`);
for (const [table, rows] of Object.entries(totals)) {
  console.log(`   ${table.padEnd(24)} ${String(rows).padStart(10)} rows`);
}

if (notes.length > 0) {
  console.log(`\nℹ️  ${notes.length} file(s) grew during the export:`);
  for (const note of notes) console.log(`   ${note}`);
}

if (problems.length > 0) {
  console.error(`\n❌ ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`   ${problem}`);
  console.error('\n   Re-run your rsync — it will fetch just the bad files.');
  process.exit(1);
}

console.log('\n✅ Export is complete — no missing, truncated or corrupt files.');

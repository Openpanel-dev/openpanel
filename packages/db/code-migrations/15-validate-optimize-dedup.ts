import {
  chMigrationClient,
} from '../src/clickhouse/migration';

/**
 * Validate OPTIMIZE TABLE DEDUPLICATE impact on events_tmp
 *
 * Shows duplicate counts per day and per date range (Jan 1-15 vs Jan 16-31)
 * to prove that OPTIMIZE on partition 202601 won't affect Jan 16-31 data.
 *
 * Usage:
 *   Validate (default):
 *     pnpm migrate:deploy:code -- 15 --cluster --no-record
 *
 *   Execute OPTIMIZE after validation:
 *     pnpm migrate:deploy:code -- 15 --cluster --no-record --execute
 */

const TMP_TABLE = 'events_tmp';

const DEDUP_KEY =
  'project_id, name, device_id, profile_id, created_at, path';

function parseArgs() {
  const args = process.argv;
  return {
    shouldExecute: args.includes('--execute'),
  };
}

export async function up() {
  const { shouldExecute } = parseArgs();

  console.log('='.repeat(60));
  console.log('  OPTIMIZE DEDUPLICATE VALIDATION');
  console.log(`  Table:   ${TMP_TABLE}`);
  console.log(`  Mode:    ${shouldExecute ? 'VALIDATE + EXECUTE' : 'VALIDATE ONLY'}`);
  console.log('='.repeat(60));

  // Step 1: Per-day breakdown — total vs unique
  console.log(`\n[Step 1] Per-day duplicate analysis for January 2026:`);
  const perDayResult = await chMigrationClient.query({
    query: `
      SELECT
        toDate(created_at) as date,
        count() as total,
        uniqExact(${DEDUP_KEY}) as unique_events,
        count() - uniqExact(${DEDUP_KEY}) as duplicates
      FROM ${TMP_TABLE}
      WHERE toYYYYMM(created_at) = 202601
      GROUP BY date
      ORDER BY date ASC`,
    format: 'JSONEachRow',
  });
  const perDayData = await perDayResult.json<{
    date: string;
    total: string;
    unique_events: string;
    duplicates: string;
  }>();

  console.log(
    `\n  ${'Date'.padEnd(14)} ${'Total'.padStart(12)} ${'Unique'.padStart(12)} ${'Duplicates'.padStart(12)} ${'Dup %'.padStart(8)}`,
  );
  console.log('  ' + '-'.repeat(60));

  let grandTotal = 0;
  let grandUnique = 0;
  let grandDuplicates = 0;
  for (const row of perDayData) {
    const total = Number(row.total);
    const unique = Number(row.unique_events);
    const dups = Number(row.duplicates);
    const dupPct = total > 0 ? ((dups / total) * 100).toFixed(1) : '0.0';
    grandTotal += total;
    grandUnique += unique;
    grandDuplicates += dups;
    console.log(
      `  ${row.date.padEnd(14)} ${total.toLocaleString().padStart(12)} ${unique.toLocaleString().padStart(12)} ${dups.toLocaleString().padStart(12)} ${(dupPct + '%').padStart(8)}`,
    );
  }
  console.log('  ' + '-'.repeat(60));
  const grandDupPct =
    grandTotal > 0
      ? ((grandDuplicates / grandTotal) * 100).toFixed(1)
      : '0.0';
  console.log(
    `  ${'TOTAL'.padEnd(14)} ${grandTotal.toLocaleString().padStart(12)} ${grandUnique.toLocaleString().padStart(12)} ${grandDuplicates.toLocaleString().padStart(12)} ${(grandDupPct + '%').padStart(8)}`,
  );

  // Step 2: Date range summary — Jan 1-15 vs Jan 16-31
  console.log(`\n[Step 2] Date range summary (Jan 1-15 vs Jan 16-31):`);
  const rangeResult = await chMigrationClient.query({
    query: `
      SELECT
        if(toDate(created_at) <= '2026-01-15', 'Jan 01-15', 'Jan 16-31') as date_range,
        count() as total,
        uniqExact(${DEDUP_KEY}) as unique_events,
        count() - uniqExact(${DEDUP_KEY}) as duplicates
      FROM ${TMP_TABLE}
      WHERE toYYYYMM(created_at) = 202601
      GROUP BY date_range
      ORDER BY date_range ASC`,
    format: 'JSONEachRow',
  });
  const rangeData = await rangeResult.json<{
    date_range: string;
    total: string;
    unique_events: string;
    duplicates: string;
  }>();

  console.log(
    `\n  ${'Range'.padEnd(14)} ${'Total'.padStart(12)} ${'Unique'.padStart(12)} ${'Duplicates'.padStart(12)} ${'Dup %'.padStart(8)}`,
  );
  console.log('  ' + '-'.repeat(60));
  for (const row of rangeData) {
    const total = Number(row.total);
    const unique = Number(row.unique_events);
    const dups = Number(row.duplicates);
    const dupPct = total > 0 ? ((dups / total) * 100).toFixed(1) : '0.0';
    console.log(
      `  ${row.date_range.padEnd(14)} ${total.toLocaleString().padStart(12)} ${unique.toLocaleString().padStart(12)} ${dups.toLocaleString().padStart(12)} ${(dupPct + '%').padStart(8)}`,
    );
  }

  // Step 3: Safety check — verify Jan 16-31 has 0 duplicates
  const jan16_31 = rangeData.find((r) => r.date_range === 'Jan 16-31');
  const jan16_31_dups = jan16_31 ? Number(jan16_31.duplicates) : 0;

  if (jan16_31_dups > 0) {
    console.log(`\n  ⚠ WARNING: Jan 16-31 has ${jan16_31_dups.toLocaleString()} duplicates!`);
    console.log('  OPTIMIZE DEDUPLICATE on partition 202601 WILL affect Jan 16-31 data.');
    console.log('  Review the per-day breakdown above before proceeding.');
  } else {
    console.log(`\n  ✓ Jan 16-31 has 0 duplicates — OPTIMIZE will NOT affect it.`);
  }

  if (!shouldExecute) {
    console.log('\n[VALIDATE ONLY] To execute OPTIMIZE, re-run with --execute flag:');
    console.log(
      '  pnpm migrate:deploy:code -- 15 --cluster --no-record --execute',
    );
    return;
  }

  // Step 4: Execute OPTIMIZE DEDUPLICATE
  console.log(`\n[Step 3] Running OPTIMIZE TABLE DEDUPLICATE on partition 202601...`);
  console.log('  This may take several minutes...');

  await chMigrationClient.query({
    query: `
      OPTIMIZE TABLE ${TMP_TABLE}
      PARTITION '202601'
      FINAL
      DEDUPLICATE BY ${DEDUP_KEY}`,
  });

  console.log('  OPTIMIZE complete!');

  // Step 5: Verify after OPTIMIZE
  console.log(`\n[Step 4] Post-OPTIMIZE verification:`);
  const afterResult = await chMigrationClient.query({
    query: `
      SELECT
        if(toDate(created_at) <= '2026-01-15', 'Jan 01-15', 'Jan 16-31') as date_range,
        count() as total,
        uniqExact(${DEDUP_KEY}) as unique_events,
        count() - uniqExact(${DEDUP_KEY}) as duplicates
      FROM ${TMP_TABLE}
      WHERE toYYYYMM(created_at) = 202601
      GROUP BY date_range
      ORDER BY date_range ASC`,
    format: 'JSONEachRow',
  });
  const afterData = await afterResult.json<{
    date_range: string;
    total: string;
    unique_events: string;
    duplicates: string;
  }>();

  console.log(
    `\n  ${'Range'.padEnd(14)} ${'Total'.padStart(12)} ${'Unique'.padStart(12)} ${'Duplicates'.padStart(12)}`,
  );
  console.log('  ' + '-'.repeat(52));
  for (const row of afterData) {
    const total = Number(row.total);
    const unique = Number(row.unique_events);
    const dups = Number(row.duplicates);
    console.log(
      `  ${row.date_range.padEnd(14)} ${total.toLocaleString().padStart(12)} ${unique.toLocaleString().padStart(12)} ${dups.toLocaleString().padStart(12)}`,
    );
  }

  console.log('\n' + '='.repeat(60));
  console.log('  OPTIMIZE DEDUPLICATE COMPLETE');
  console.log('='.repeat(60));
}

export async function down() {
  console.log('No down migration');
}

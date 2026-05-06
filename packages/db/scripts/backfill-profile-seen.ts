// One-off backfill that reconciles `profiles.created_at` (first seen) and
// `profiles.last_seen_at` (last seen) against actual event activity.
//
// After migration `16-restructure-profiles.ts` runs, every profile has
// `last_seen_at = created_at`. From cutover onward the buffer's session-boundary
// upserts move `last_seen_at` forward — but historically active profiles with no
// new sessions stay at their migrated value until they're seen again.
//
// Run this once (per environment) when you want post-migration `last_seen_at`
// (and, defensively, `created_at`) to match what the events table already
// records.
//
// How it works:
//   For each project, INSERT one new row per profile with:
//     created_at   = least(existing, min(events.created_at))
//     last_seen_at = greatest(existing, max(events.created_at))
//   ReplacingMergeTree(last_seen_at) dedups on the next merge, keeping the row
//   with the higher `last_seen_at` — i.e. our updated row wins whenever it has
//   newer activity, otherwise the existing row wins (greatest = old value).
//
// Per-project iteration is the trick that avoids needing a temp table:
//   - The events table is sharded/sorted by `project_id` first, so the WHERE
//     clause partition-prunes the events scan to that project.
//   - Memory is bounded by one project's profile count, not the whole table.
//   - Each project is one round-trip, so progress is observable.
//
// Usage:
//   cd packages/db
//   pnpm with-env tsx scripts/backfill-profile-seen.ts            # all projects
//   pnpm with-env tsx scripts/backfill-profile-seen.ts --dry-run  # print SQL, no writes
//   pnpm with-env tsx scripts/backfill-profile-seen.ts --project=abc123  # one project
//   pnpm with-env tsx scripts/backfill-profile-seen.ts --concurrency=4   # N projects in parallel

import { parseArgs } from 'node:util';
import { ch, chQuery, TABLE_NAMES } from '../src/clickhouse/client';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    'dry-run': { type: 'boolean', default: false },
    project: { type: 'string' },
    concurrency: { type: 'string', default: '1' },
  },
  strict: false,
});

const dryRun = Boolean(values['dry-run']);
const onlyProject =
  typeof values.project === 'string' ? values.project : undefined;
const concurrency = Math.max(
  1,
  Number.parseInt(
    typeof values.concurrency === 'string' ? values.concurrency : '1',
    10,
  ) || 1,
);

function buildSql(): string {
  // `join_use_nulls = 1` makes unmatched LEFT JOIN columns NULL (instead of
  // 1970-01-01 defaults), so `ifNull` cleanly falls back to the profile's
  // existing values for profiles that have no events.
  //
  // `device_id != profile_id` excludes anonymous device-only events from the
  // lookup (matches the convention used in our other profile/event queries).
  return `
    INSERT INTO ${TABLE_NAMES.profiles}
      (id, is_external, first_name, last_name, email, avatar, properties,
       project_id, groups, created_at, last_seen_at)
    SELECT
      p.id,
      p.is_external,
      p.first_name,
      p.last_name,
      p.email,
      p.avatar,
      p.properties,
      p.project_id,
      p.groups,
      least(p.created_at, ifNull(e.first_seen, p.created_at))   AS created_at,
      greatest(p.last_seen_at, ifNull(e.last_seen, p.last_seen_at)) AS last_seen_at
    FROM ${TABLE_NAMES.profiles} AS p FINAL
    LEFT JOIN (
      SELECT
        profile_id,
        min(created_at) AS first_seen,
        max(created_at) AS last_seen
      FROM ${TABLE_NAMES.events}
      WHERE project_id = {projectId:String}
        AND profile_id != ''
        AND device_id != profile_id
      GROUP BY profile_id
    ) AS e ON e.profile_id = p.id
    WHERE p.project_id = {projectId:String}
    SETTINGS
      join_use_nulls = 1,
      -- 'global' rewrites the subquery JOIN to GLOBAL JOIN in cluster mode,
      -- so the events aggregate is gathered across all shards on the
      -- initiator and broadcast. Without it, each shard would only see its
      -- local events slice and the last_seen lookup could undercount. No-op
      -- in non-clustered setups.
      distributed_product_mode = 'global',
      insert_distributed_sync = 1
  `;
}

async function backfillProject(projectId: string, index: number, total: number) {
  const t0 = Date.now();
  const sql = buildSql();

  if (dryRun) {
    console.log(
      `[backfill] [${index}/${total}] DRY RUN project=${projectId}\n${sql}\n`,
    );
    return;
  }

  await ch.command({
    query: sql,
    query_params: { projectId },
  });

  const ms = Date.now() - t0;
  console.log(
    `[backfill] [${index}/${total}] project=${projectId} done in ${ms}ms`,
  );
}

async function main() {
  const start = Date.now();

  let projectIds: string[];
  if (onlyProject) {
    projectIds = [onlyProject];
  } else {
    const rows = await chQuery<{ project_id: string }>(
      `SELECT DISTINCT project_id FROM ${TABLE_NAMES.profiles}
       ORDER BY project_id`,
    );
    projectIds = rows.map((r) => r.project_id);
  }

  console.log(
    `[backfill] ${projectIds.length} project(s) · concurrency=${concurrency}${dryRun ? ' · DRY RUN' : ''}`,
  );

  // Simple worker-pool: each worker drains a shared cursor.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, projectIds.length) }, async () => {
      while (cursor < projectIds.length) {
        const i = cursor++;
        const id = projectIds[i]!;
        try {
          await backfillProject(id, i + 1, projectIds.length);
        } catch (err) {
          console.error(
            `[backfill] [${i + 1}/${projectIds.length}] project=${id} FAILED`,
            err,
          );
        }
      }
    }),
  );

  console.log(`[backfill] Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error('[backfill] Fatal error:', err);
  process.exit(1);
});

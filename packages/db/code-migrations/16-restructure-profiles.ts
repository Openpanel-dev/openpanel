import fs from 'node:fs';
import path from 'node:path';
import {
  chMigrationClient,
  createTable,
  renameTable,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

// Restructures the `profiles` table so the column names actually mean what
// they say:
//
//   - `created_at`    → first time this profile was seen (preserved across
//                       upserts, like a real created_at). NOT the RMT version.
//   - `last_seen_at`  → most recent activity. NEW column. ReplacingMergeTree
//                       uses this as its version, so dedup naturally keeps the
//                       latest.
//
// Before this migration we abused `created_at` as both the version column and
// (de facto, due to the buffer's merge logic) the first-seen marker. That
// double duty was confusing and fragile.
//
// Strategy mirrors `8-order-keys.ts`:
//   1. Create `profiles_new_<DATE>` with the new schema.
//   2. Batch-copy month-by-month from the existing `profiles` (FINAL),
//      seeding `last_seen_at` from `created_at`. The buffer's session-boundary
//      upserts will start moving `last_seen_at` forward immediately after
//      cutover; profiles that go inactive simply keep `last_seen_at = created_at`,
//      which is honest — they haven't been seen since.
//   3. Rename current `profiles` → `profiles_<DATE>` and the new table into
//      place as `profiles`.
//
// If a deployment specifically wants accurate `last_seen_at` for historically
// active profiles right after the migration, run a one-off backfill against
// events:
//
//   INSERT INTO profiles SELECT
//     id, is_external, first_name, last_name, email, avatar, properties,
//     project_id, groups, created_at,
//     greatest(last_seen_at, e.last_seen_at) AS last_seen_at
//   FROM profiles AS p
//   ANY LEFT JOIN (
//     SELECT project_id, profile_id, max(created_at) AS last_seen_at
//     FROM events
//     WHERE profile_id != '' AND device_id != profile_id
//     GROUP BY project_id, profile_id
//   ) AS e
//     ON e.project_id = p.project_id AND e.profile_id = p.id
//   SETTINGS distributed_product_mode = 'allow';
//
// (RMT's version column resolves the dedup — the row with the higher
// `last_seen_at` wins.) Skip this on small/self-hosted deployments; it's not
// required for correctness.
//
// During the migration window, profile upserts hitting the renamed-away
// `profiles` table will be lost. Stop the worker (or accept brief data loss)
// before running in production.

const SUFFIX = '20260504';
const NEW_TABLE = `profiles_new_${SUFFIX}`;
const OLD_TABLE = `profiles_${SUFFIX}`;

const replicated = (table: string) => `${table}_replicated`;

export async function up() {
  const isClustered = getIsCluster();
  const sqls: string[] = [];

  // 1. New profiles table. ReplacingMergeTree's version is now `last_seen_at`,
  //    so the latest activity timestamp wins on dedup — and `created_at` is
  //    preserved naturally (no longer the version, no special merge handling).
  const profileTables = createTable({
    name: NEW_TABLE,
    columns: [
      '`id` String CODEC(ZSTD(3))',
      '`is_external` Bool',
      '`first_name` String CODEC(ZSTD(3))',
      '`last_name` String CODEC(ZSTD(3))',
      '`email` String CODEC(ZSTD(3))',
      '`avatar` String CODEC(ZSTD(3))',
      '`properties` Map(String, String) CODEC(ZSTD(3))',
      '`project_id` String CODEC(ZSTD(3))',
      '`groups` Array(String) DEFAULT [] CODEC(ZSTD(3))',
      '`created_at` DateTime64(3) CODEC(Delta(4), LZ4)',
      '`last_seen_at` DateTime64(3) CODEC(Delta(4), LZ4)',
    ],
    indices: [
      'INDEX idx_first_name first_name TYPE bloom_filter GRANULARITY 1',
      'INDEX idx_last_name last_name TYPE bloom_filter GRANULARITY 1',
      'INDEX idx_email email TYPE bloom_filter GRANULARITY 1',
    ],
    engine: 'ReplacingMergeTree(last_seen_at)',
    orderBy: ['project_id', 'id'],
    partitionBy: 'toYYYYMM(created_at)',
    settings: { index_granularity: 8192 },
    distributionHash: 'cityHash64(project_id)',
    replicatedVersion: '2',
    isClustered,
  });
  sqls.push(...profileTables);

  // 2. Find the oldest profile so we know how far back to batch.
  const firstProfileResp = await chMigrationClient.query({
    query: 'SELECT min(created_at) AS created_at FROM profiles',
    format: 'JSONEachRow',
  });
  const firstProfileJson = await firstProfileResp.json<{
    created_at: string;
  }>();
  const firstDate = firstProfileJson[0]?.created_at;

  if (firstDate && !firstDate.startsWith('1970')) {
    const startDate = new Date(firstDate);
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(1);

    const monthBoundary = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

    let cursor = new Date(endDate);
    while (true) {
      const lower = new Date(cursor);
      lower.setMonth(lower.getMonth() - 1);
      // Don't go below the first profile's month.
      if (
        lower.getFullYear() < startDate.getFullYear() ||
        (lower.getFullYear() === startDate.getFullYear() &&
          lower.getMonth() < startDate.getMonth())
      ) {
        lower.setFullYear(startDate.getFullYear());
        lower.setMonth(startDate.getMonth());
        lower.setDate(1);
      }

      sqls.push(
        // Aliases are intentionally distinct from column names. ClickHouse
        // resolves identifiers against SELECT-list aliases first, so naming an
        // alias `created_at` would shadow the source column inside `argMax(..., created_at)`
        // and trigger ILLEGAL_AGGREGATION ("aggregate inside another aggregate").
        // INSERT INTO ... (col list) SELECT maps positionally, so the alias
        // names don't need to match the target columns.
        `INSERT INTO ${NEW_TABLE}
           (id, is_external, first_name, last_name, email, avatar, properties,
            project_id, groups, created_at, last_seen_at)
         SELECT
           id,
           argMax(is_external, created_at) as v_is_external,
           argMax(nullIf(first_name, ''), created_at) as v_first_name,
           argMax(nullIf(last_name, ''), created_at) as v_last_name,
           argMax(nullIf(email, ''), created_at) as v_email,
           argMax(nullIf(avatar, ''), created_at) as v_avatar,
           argMax(properties, created_at) as v_properties,
           project_id,
           argMax(groups, created_at) as v_groups,
           min(created_at) as v_created_at,
           min(created_at) as v_last_seen_at
         FROM profiles FINAL
         WHERE profiles.created_at >= toDateTime('${monthBoundary(lower)}')
           AND profiles.created_at <  toDateTime('${monthBoundary(cursor)}')
         GROUP BY id, project_id
         SETTINGS insert_distributed_sync = 1`
      );

      // Stop once we've processed the month containing the oldest profile.
      if (
        lower.getFullYear() === startDate.getFullYear() &&
        lower.getMonth() === startDate.getMonth()
      ) {
        break;
      }
      cursor = lower;
    }
  }

  // 3. Atomic-ish swap. Same dance as 8-order-keys.ts: rename the existing
  //    table aside, then promote the new one in place. In cluster mode we
  //    rename the underlying replicated table and rebuild the Distributed
  //    wrapper.
  sqls.push(...renameTable({ from: 'profiles', to: OLD_TABLE, isClustered }));

  if (isClustered && profileTables[1]) {
    sqls.push(
      `DROP TABLE IF EXISTS ${NEW_TABLE} ON CLUSTER '{cluster}'`,
      `RENAME TABLE ${replicated(NEW_TABLE)} TO ${replicated('profiles')} ON CLUSTER '{cluster}'`,
      // Rebuild the distributed wrapper pointing at the new replicated table.
      profileTables[1].replaceAll(NEW_TABLE, 'profiles')
    );
  } else {
    sqls.push(...renameTable({ from: NEW_TABLE, to: 'profiles', isClustered }));
  }

  fs.writeFileSync(
    path.join(import.meta.filename.replace('.ts', '.sql')),
    sqls
      .map((sql) =>
        sql
          .trim()
          .replace(/;$/, '')
          .replace(/\n{2,}/g, '\n')
          .concat(';')
      )
      .join('\n\n---\n\n')
  );

  if (!process.argv.includes('--dry')) {
    await runClickhouseMigrationCommands(sqls);
  }
}

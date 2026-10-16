// Removes what an earlier run seeded for the same projects. Postgres rows are
// upserted in place, so only ClickHouse needs clearing; the materialized views
// are not rebuilt from `events` on delete and must be cleared explicitly.

import { ch } from '@openpanel/db';

const TABLES_WITH_PROJECT_ROWS = ['events', 'sessions', 'profiles'] as const;

const MATERIALIZED_VIEWS_WITH_PROJECT_ROWS = [
  'dau_mv',
  'distinct_event_names_mv',
  'event_property_values_mv',
  'cohort_events_mv',
  'event_profile_summary_mv',
  'event_property_profile_summary_mv',
] as const;

function quoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export async function resetProjects(
  projectIds: readonly string[]
): Promise<void> {
  const list = projectIds.map(quoted).join(', ');
  for (const table of TABLES_WITH_PROJECT_ROWS) {
    await ch.command({
      query: `DELETE FROM ${table} WHERE project_id IN (${list})`,
    });
  }
  for (const view of MATERIALIZED_VIEWS_WITH_PROJECT_ROWS) {
    await ch.command({
      query: `ALTER TABLE ${view} DELETE WHERE project_id IN (${list})`,
      clickhouse_settings: { mutations_sync: '2' },
    });
  }
}

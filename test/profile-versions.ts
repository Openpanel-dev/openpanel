/**
 * Profiles with several unmerged versions, for proving a query without
 * `FINAL` returns what `FINAL` would. Every version is its own insert, so its
 * own part, and merges are stopped on `profiles` while the fixture is live;
 * otherwise ClickHouse may collapse the versions before the test runs and the
 * comparison proves nothing. Deletes happen while merges run: a lightweight
 * DELETE is a mutation, and the mutation pool waits on the same stop.
 *
 *   multi      — 3 versions, inserted out of order (v1, v3, v2): name, email,
 *                properties, groups and is_external all change between them
 *   staleMatch — an old version with plan=pro, the latest plan=free: a filter
 *                on raw rows matches it, a filter on the latest row must not
 *   single     — one version
 *   multi (again) in `<projectId>-other` with its own properties: must not leak
 *
 * Each profile has events in the last 7 days so join shapes have rows to join.
 */

import { createClient } from '../packages/db/src/clickhouse/client';
import { TEST_CLICKHOUSE_URL } from './databases';
import { buildEvent, timeAgo } from './fixtures';

export const VERSIONED = {
  multi: 'pv-multi',
  staleMatch: 'pv-stale-match',
  single: 'pv-single',
  groups: { g1: 'pv-group-1', g2: 'pv-group-2' },
} as const;

export const otherProjectId = (projectId: string) => `${projectId}-other`;

type Version = Record<string, unknown>;

function profileVersions(projectId: string, now: Date): Version[][] {
  const base = (id: string, createdDaysAgo: number) => ({
    id,
    project_id: projectId,
    avatar: '',
    created_at: timeAgo(now, createdDaysAgo),
  });
  return [
    [
      {
        ...base(VERSIONED.multi, 40),
        first_name: 'Mia',
        last_name: 'Kim',
        email: 'mia@old.example',
        is_external: false,
        properties: { plan: 'free', country: 'US' },
        groups: [],
        last_seen_at: timeAgo(now, 40),
      },
      {
        ...base(VERSIONED.multi, 40),
        first_name: 'Mia',
        last_name: 'Kim-Lee',
        email: 'mia@new.example',
        is_external: true,
        properties: {
          plan: 'team',
          country: 'SE',
          tier: 'gold',
          'experiments.checkout.name': 'one-page',
        },
        groups: [VERSIONED.groups.g1, VERSIONED.groups.g2],
        last_seen_at: timeAgo(now, 2),
      },
      {
        ...base(VERSIONED.multi, 40),
        first_name: 'Mia',
        last_name: 'Kim',
        email: 'mia@new.example',
        is_external: true,
        properties: { plan: 'pro', country: 'SE' },
        groups: [VERSIONED.groups.g1],
        last_seen_at: timeAgo(now, 20),
      },
    ],
    [
      {
        ...base(VERSIONED.staleMatch, 30),
        first_name: 'Sam',
        last_name: 'Old',
        email: 'sam@example.com',
        is_external: true,
        properties: { plan: 'pro', country: 'US' },
        groups: [],
        last_seen_at: timeAgo(now, 30),
      },
      {
        ...base(VERSIONED.staleMatch, 30),
        first_name: 'Sam',
        last_name: 'New',
        email: 'sam@example.com',
        is_external: true,
        properties: { plan: 'free', country: 'US' },
        groups: [VERSIONED.groups.g1],
        last_seen_at: timeAgo(now, 3),
      },
    ],
    [
      {
        ...base(VERSIONED.single, 10),
        first_name: 'Uno',
        last_name: 'Solo',
        email: 'uno@example.com',
        is_external: true,
        properties: { plan: 'pro', country: 'DE' },
        groups: [VERSIONED.groups.g2],
        last_seen_at: timeAgo(now, 10),
      },
    ],
    [
      {
        ...base(VERSIONED.multi, 5),
        project_id: otherProjectId(projectId),
        first_name: 'Other',
        last_name: 'Project',
        email: 'other@example.com',
        is_external: true,
        properties: { plan: 'enterprise', country: 'NO' },
        groups: [VERSIONED.groups.g1],
        last_seen_at: timeAgo(now, 1),
      },
    ],
  ];
}

function eventRows(projectId: string, now: Date) {
  const event = (
    id: number,
    name: string,
    profileId: string,
    daysBack: number,
    project = projectId
  ) =>
    buildEvent(
      now,
      project,
      `00000000-0000-0000-0000-0000000000${String(id).padStart(2, '0')}`,
      name,
      profileId,
      `sess-${profileId}-${id}`,
      daysBack
    );
  return [
    event(11, 'screen_view', VERSIONED.multi, 6),
    event(12, 'screen_view', VERSIONED.multi, 3),
    event(13, 'screen_view', VERSIONED.multi, 1),
    event(14, 'signup', VERSIONED.multi, 1),
    event(15, 'screen_view', VERSIONED.staleMatch, 4),
    event(16, 'screen_view', VERSIONED.single, 5),
    event(17, 'signup', VERSIONED.single, 5),
    event(18, 'screen_view', VERSIONED.multi, 1, otherProjectId(projectId)),
  ];
}

async function deleteRows(
  client: ReturnType<typeof createClient>,
  projectId: string
) {
  for (const project of [projectId, otherProjectId(projectId)]) {
    await client.command({
      query: `DELETE FROM profiles WHERE project_id = '${project}'`,
    });
    await client.command({
      query: `DELETE FROM events WHERE project_id = '${project}'`,
    });
  }
}

export async function setupProfileVersions(projectId: string): Promise<Date> {
  const client = createClient({ url: TEST_CLICKHOUSE_URL });
  const now = new Date();
  try {
    await deleteRows(client, projectId);
    await client.command({ query: 'SYSTEM STOP MERGES profiles' });
    for (const versions of profileVersions(projectId, now)) {
      for (const version of versions) {
        await client.insert({
          table: 'profiles',
          values: [version],
          format: 'JSONEachRow',
        });
      }
    }
    await client.insert({
      table: 'events',
      values: eventRows(projectId, now),
      format: 'JSONEachRow',
    });
  } finally {
    await client.close();
  }
  return now;
}

export async function teardownProfileVersions(projectId: string) {
  const client = createClient({ url: TEST_CLICKHOUSE_URL });
  try {
    await client.command({ query: 'SYSTEM START MERGES profiles' });
    await deleteRows(client, projectId);
  } finally {
    await client.close();
  }
}

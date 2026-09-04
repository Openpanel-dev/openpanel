// The profile service lives in @openpanel/core now (M7-002):
// packages/core/src/modules/profile/profile.service.ts, with every ClickHouse
// query rewritten onto the `sql` tag (packages/core/src/modules/profile/src/
// profile.sql.ts). Re-exported here for existing `@openpanel/db` importers
// (packages/trpc's profile/chart routers, apps/api's insights controller,
// the assistant/mcp tools, profile-buffer's IClickhouseProfile type) — same
// shape as session.service.ts since M7-001.
export {
  type FindProfilesInput,
  findProfilesCore,
  getProfileById,
  getProfileList,
  getProfileListCount,
  getProfileMetrics,
  getProfileMetricsCore,
  getProfilePropertyKeys,
  getProfilePropertyKeysCached,
  getProfileSessionsCore,
  getProfiles,
  getProfilesCached,
  getProfileWithEvents,
  type IClickhouseProfile,
  type IProfileMetrics,
  type IServiceProfile,
  type IServiceUpsertProfile,
  transformProfile,
  upsertProfile,
} from '@openpanel/core';

import sqlstring from 'sqlstring';

const MAX_SEARCH_TOKENS = 5;

/**
 * String-SQL twin of core's `profileSearchCondition`, kept for
 * cohort.service.ts's `getCohortProfiles`, which still composes V1 text
 * queries. Goes with that query when it moves onto the `sql` tag.
 */
export function profileSearchSql(
  search: string | null | undefined
): string | null {
  const tokens = (search ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_SEARCH_TOKENS);
  if (tokens.length === 0) {
    return null;
  }
  const perToken = tokens.map((token) => {
    const like = sqlstring.escape(`%${token}%`);
    return `(id ILIKE ${like} OR email ILIKE ${like} OR first_name ILIKE ${like} OR last_name ILIKE ${like} OR concat(first_name, ' ', last_name) ILIKE ${like})`;
  });
  return `(${perToken.join(' AND ')})`;
}

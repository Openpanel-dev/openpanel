// Ported from packages/db/src/services/profile-columns.test.ts (main #512).
// The JOIN column list used to be built by splitting raw `profile.*` filter
// names, so a crafted name could close the subquery (GHSA-pc3q-gw7f-p2x2).
// The rewrite binds every identifier through `sql.id`, so injection is
// impossible; what these assert is that the list is also an allowlist, so a
// filter cannot name a column it has no business reading.
import { describe, expect, it } from 'bun:test';
import { JOINABLE_PROFILE_COLUMNS } from '../chart.constants';
import { profileJoinFields } from './funnel.sql';

describe('profile join columns', () => {
  it('keeps the joinable columns a filter names', () => {
    const fields = profileJoinFields(['email', 'first_name'], []);
    expect(fields).toContain('email');
    expect(fields).toContain('first_name');
  });

  it('drops a column that is not joinable', () => {
    const fields = profileJoinFields(['project_id', 'is_external'], []);
    expect(fields).not.toContain('project_id');
    expect(fields).not.toContain('is_external');
  });

  it('drops an injection attempt outright', () => {
    const fields = profileJoinFields(
      ['id) WHERE 1=1 UNION SELECT name FROM events--'],
      []
    );
    expect(fields).toEqual(['id']);
  });

  it('never offers a column outside the allowlist plus the key', () => {
    const allowed = new Set([...JOINABLE_PROFILE_COLUMNS, 'id']);
    const fields = profileJoinFields(
      ['email', 'password', 'properties.plan'],
      [{ name: 'profile.last_seen_at' }, { name: 'profile.avatar' }]
    );
    for (const field of fields) {
      expect(allowed.has(field)).toBe(true);
    }
  });
});

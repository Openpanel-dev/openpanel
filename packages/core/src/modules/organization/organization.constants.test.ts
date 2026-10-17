import { describe, expect, it } from 'bun:test';
import {
  zEditOrganization,
  zInviteUser,
  zTimezone,
  zUpdateMemberAccess,
} from './organization.constants';

describe('zTimezone', () => {
  it('accepts IANA zones, trims, and canonicalises case', () => {
    expect(zTimezone.parse('Europe/Stockholm')).toBe('Europe/Stockholm');
    expect(zTimezone.parse('UTC')).toBe('UTC');
    expect(zTimezone.parse('utc')).toBe('UTC');
    expect(zTimezone.parse(' Etc/UTC ')).toBe('Etc/UTC');
  });

  it('rejects unknown zones before they can be stored', () => {
    expect(zTimezone.safeParse('Not/AZone').success).toBe(false);
    expect(zTimezone.safeParse('').success).toBe(false);
    expect(
      zEditOrganization.safeParse({
        id: 'org_1',
        name: 'Acme',
        timezone: 'Mars/Olympus',
      }).success
    ).toBe(false);
  });
});

// The previous image reads no project_access rows as every project.
describe('an empty selected scope', () => {
  const invite = {
    email: 'a@example.com',
    organizationId: 'org_1',
    role: 'member' as const,
  };

  it('is rejected for invites and access updates', () => {
    expect(
      zInviteUser.safeParse({ ...invite, projectScope: 'selected', access: [] })
        .success
    ).toBe(false);
    expect(
      zUpdateMemberAccess.safeParse({
        userId: 'user_1',
        organizationId: 'org_1',
        projectScope: 'selected',
        access: [],
      }).success
    ).toBe(false);
  });

  it('allows all projects, or a selection with at least one project', () => {
    expect(
      zInviteUser.safeParse({ ...invite, projectScope: 'all', access: [] })
        .success
    ).toBe(true);
    expect(
      zInviteUser.safeParse({
        ...invite,
        projectScope: 'selected',
        access: [{ projectId: 'proj_1', level: 'read' }],
      }).success
    ).toBe(true);
  });
});

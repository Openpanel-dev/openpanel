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

// A selection of no projects means no project access, which is a valid choice.
describe('an empty selected scope', () => {
  it('is accepted for invites and access updates', () => {
    expect(
      zInviteUser.safeParse({
        email: 'a@example.com',
        organizationId: 'org_1',
        role: 'member',
        projectScope: 'selected',
        access: [],
      }).success
    ).toBe(true);
    expect(
      zUpdateMemberAccess.safeParse({
        userId: 'user_1',
        organizationId: 'org_1',
        projectScope: 'selected',
        access: [],
      }).success
    ).toBe(true);
  });
});

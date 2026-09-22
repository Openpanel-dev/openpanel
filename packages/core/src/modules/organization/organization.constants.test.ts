import { describe, expect, it } from 'bun:test';
import { zEditOrganization, zTimezone } from './organization.constants';

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

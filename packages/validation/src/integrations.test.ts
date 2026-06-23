import { describe, expect, it } from 'vitest';
import { isKind } from './integrations';

describe('isKind', () => {
  it('matches a declared capability', () => {
    expect(isKind({ type: 's3_export' }, 'export')).toBe(true);
    expect(isKind({ type: 'gcs_export' }, 'export')).toBe(true);
    expect(isKind({ type: 'slack' }, 'notification')).toBe(true);
    expect(isKind({ type: 'webhook' }, 'notification')).toBe(true);
  });

  it('returns false for a capability the integration does not have', () => {
    expect(isKind({ type: 's3_export' }, 'notification')).toBe(false);
    expect(isKind({ type: 'slack' }, 'export')).toBe(false);
  });

  it('is lenient for empty/unknown config (does not throw)', () => {
    // A Slack integration before its OAuth callback has config {} with no type;
    // the export cron filters over every integration, so this must not throw.
    expect(isKind({}, 'export')).toBe(false);
    expect(isKind({ type: undefined }, 'export')).toBe(false);
    expect(isKind({ type: 'something-unknown' }, 'export')).toBe(false);
  });
});

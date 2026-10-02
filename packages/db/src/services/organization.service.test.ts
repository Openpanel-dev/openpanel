import { describe, expect, it } from 'vitest';
import { getInviteFailureCode, InviteError } from './organization.service';

describe('InviteError', () => {
  it('carries a machine-readable code alongside the message', () => {
    const error = new InviteError('expired', 'Invite expired');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InviteError');
    expect(error.code).toBe('expired');
    expect(error.message).toBe('Invite expired');
  });
});

describe('getInviteFailureCode', () => {
  it('extracts the code from an InviteError', () => {
    expect(getInviteFailureCode(new InviteError('expired', 'x'))).toBe(
      'expired'
    );
    expect(getInviteFailureCode(new InviteError('not_found', 'x'))).toBe(
      'not_found'
    );
    expect(getInviteFailureCode(new InviteError('not_allowed', 'x'))).toBe(
      'not_allowed'
    );
  });

  it('returns null for anything else, so callers can tell an expired invite from a fault', () => {
    expect(getInviteFailureCode(new Error('Invite expired'))).toBeNull();
    expect(getInviteFailureCode('expired')).toBeNull();
    expect(getInviteFailureCode(null)).toBeNull();
    expect(getInviteFailureCode(undefined)).toBeNull();
  });
});

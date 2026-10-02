import { afterEach, describe, expect, it } from 'vitest';
import { getInviteExpiryDays } from './organization';

const ORIGINAL = process.env.INVITE_EXPIRY_DAYS;

afterEach(() => {
  if (ORIGINAL === undefined) {
    Reflect.deleteProperty(process.env, 'INVITE_EXPIRY_DAYS');
  } else {
    process.env.INVITE_EXPIRY_DAYS = ORIGINAL;
  }
});

describe('getInviteExpiryDays', () => {
  it('defaults to a week', () => {
    Reflect.deleteProperty(process.env, 'INVITE_EXPIRY_DAYS');
    expect(getInviteExpiryDays()).toBe(7);
  });

  it('honours the env override', () => {
    process.env.INVITE_EXPIRY_DAYS = '14';
    expect(getInviteExpiryDays()).toBe(14);
  });

  it('clamps to a sane range rather than accepting 0 or absurd values', () => {
    process.env.INVITE_EXPIRY_DAYS = '0';
    expect(getInviteExpiryDays()).toBe(1);

    process.env.INVITE_EXPIRY_DAYS = '-5';
    expect(getInviteExpiryDays()).toBe(1);

    process.env.INVITE_EXPIRY_DAYS = '9999';
    expect(getInviteExpiryDays()).toBe(90);
  });

  it('falls back to the default on unparseable input', () => {
    process.env.INVITE_EXPIRY_DAYS = 'soon';
    expect(getInviteExpiryDays()).toBe(7);

    process.env.INVITE_EXPIRY_DAYS = '';
    expect(getInviteExpiryDays()).toBe(7);
  });

  it('does not let a numeric prefix stand in for the whole value', () => {
    // Number.parseInt('3days', 10) reads the leading digits and would
    // silently use 3 instead of falling back to the 7-day default for an
    // invalid setting.
    process.env.INVITE_EXPIRY_DAYS = '3days';
    expect(getInviteExpiryDays()).toBe(7);

    // Number.parseInt('1e2', 10) stops at 'e' and would silently use 1
    // instead of the 100 (clamped to 90) the value actually spells out.
    process.env.INVITE_EXPIRY_DAYS = '1e2';
    expect(getInviteExpiryDays()).toBe(90);
  });
});

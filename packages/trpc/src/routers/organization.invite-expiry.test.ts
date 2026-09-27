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
});

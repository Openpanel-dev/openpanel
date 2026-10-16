// The ceilings exist so an input cannot choose how much work the server does:
// a password reaches argon2, a recovery code reaches it ten times, and an
// inviteId is written into a Set-Cookie header. These assert the bound fires
// and, just as importantly, that an ordinary value still passes.

import { describe, expect, test } from 'bun:test';
import { MAX_PASSWORD, MAX_TOKEN } from '../../shared/limits.constants';
import {
  zPassword,
  zRequestResetPassword,
  zResetPassword,
  zSignInEmail,
  zSignInShare,
  zSignUpEmail,
  zTotpCode,
  zTotpOrRecoveryCode,
} from './auth.constants';

const long = (n: number) => 'a'.repeat(n);

describe('passwords are bounded before argon2 sees them', () => {
  test('an ordinary password passes', () => {
    expect(zPassword.safeParse('correct horse battery').success).toBe(true);
  });

  test('exactly the maximum passes, one over does not', () => {
    expect(zPassword.safeParse(long(MAX_PASSWORD)).success).toBe(true);
    expect(zPassword.safeParse(long(MAX_PASSWORD + 1)).success).toBe(false);
  });

  test('the minimum still applies', () => {
    expect(zPassword.safeParse('short').success).toBe(false);
  });

  test('sign-in, sign-up, reset and share all carry the bound', () => {
    const huge = long(200_000);
    expect(
      zSignInEmail.safeParse({ email: 'a@b.co', password: huge }).success
    ).toBe(false);
    expect(
      zSignUpEmail.safeParse({
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.co',
        password: huge,
        confirmPassword: huge,
      }).success
    ).toBe(false);
    expect(
      zResetPassword.safeParse({ token: 't', password: huge }).success
    ).toBe(false);
    expect(
      zSignInShare.safeParse({ password: huge, shareId: 's' }).success
    ).toBe(false);
  });
});

describe('the TOTP inputs are bounded', () => {
  test('a six-digit code still passes, with spaces stripped', () => {
    expect(zTotpCode.parse('123 456')).toBe('123456');
  });

  // This one decides ten sequential argon2 verifies in consumeRecoveryCode.
  test('a recovery code is capped', () => {
    expect(zTotpOrRecoveryCode.safeParse('abcd-efgh').success).toBe(true);
    expect(zTotpOrRecoveryCode.safeParse(long(MAX_TOKEN + 1)).success).toBe(
      false
    );
  });

  test('a huge TOTP code is refused before the regex runs over it', () => {
    expect(zTotpCode.safeParse(long(MAX_TOKEN + 1)).success).toBe(false);
  });
});

describe('emails and names', () => {
  test('a normal address passes and an over-long one does not', () => {
    expect(
      zRequestResetPassword.safeParse({ email: 'someone@example.com' }).success
    ).toBe(true);
    expect(
      zRequestResetPassword.safeParse({ email: `${long(300)}@example.com` })
        .success
    ).toBe(false);
  });

  test('a whitespace-only name is refused, and a real one is trimmed', () => {
    const base = {
      email: 'a@b.co',
      password: 'longenough',
      confirmPassword: 'longenough',
    };
    expect(
      zSignUpEmail.safeParse({ ...base, firstName: '   ', lastName: 'B' })
        .success
    ).toBe(false);
    const ok = zSignUpEmail.safeParse({
      ...base,
      firstName: '  Ada  ',
      lastName: 'Lovelace',
    });
    expect(ok.success).toBe(true);
    expect(ok.success && ok.data.firstName).toBe('Ada');
  });
});

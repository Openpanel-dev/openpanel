// A wrong or stale second factor must not answer UNAUTHORIZED: the dashboard
// reads every 401 as "signed out" and sends the user to /login mid-challenge.

import { expect, test } from 'bun:test';
import { encrypt } from '@openpanel/shared/server';
import { testCoreConfig } from '../../../test/config-fixture';
import type { ServiceDeps } from '../../services';
import { signInWithEmail, signInWithTotp } from './auth.service';
import { hashPassword } from './src/password';
import { generateTotpSecret } from './src/totp';

const ENCRYPTION_KEY = 'a'.repeat(64);
const CHALLENGE_ID = '2fa_test';
const CHALLENGE_COOKIE = '2fa_challenge';
const USER_ID = 'user_test';
const HOUR_MS = 60 * 60 * 1000;
const noop = () => undefined;
const logger = { error: noop };

function depsWith(db: Record<string, unknown>): ServiceDeps {
  return {
    db,
    config: testCoreConfig({ encryptionKey: ENCRYPTION_KEY }),
  } as unknown as ServiceDeps;
}

function cookies(values: Record<string, string>) {
  return { get: (name: string) => values[name] };
}

function totpDb(challengeExpiresAt: Date) {
  return {
    twoFactorChallenge: {
      findUnique: () =>
        Promise.resolve({
          id: CHALLENGE_ID,
          userId: USER_ID,
          expiresAt: challengeExpiresAt,
        }),
      delete: () => Promise.resolve(),
    },
    userTotp: {
      findUnique: () =>
        Promise.resolve({
          userId: USER_ID,
          enabledAt: new Date(),
          secret: encrypt(ENCRYPTION_KEY, generateTotpSecret()),
          recoveryCodes: [],
        }),
    },
  };
}

test('signing in with a code but no challenge cookie is a bad request', async () => {
  await expect(
    signInWithTotp(depsWith({}), { code: '123456' }, cookies({}), noop, logger)
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

test('an expired two-factor challenge is a bad request', async () => {
  const db = totpDb(new Date(Date.now() - HOUR_MS));
  await expect(
    signInWithTotp(
      depsWith(db),
      { code: '123456' },
      cookies({ [CHALLENGE_COOKIE]: CHALLENGE_ID }),
      noop,
      logger
    )
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

test('a wrong two-factor code is a bad request, not unauthorized', async () => {
  const db = totpDb(new Date(Date.now() + HOUR_MS));
  await expect(
    signInWithTotp(
      depsWith(db),
      { code: '000000' },
      cookies({ [CHALLENGE_COOKIE]: CHALLENGE_ID }),
      noop,
      logger
    )
  ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Invalid code' });
});

test('a password with edge whitespace signs in exactly as it was set', async () => {
  const password = '  spaced password  ';
  const account = { id: 'acc_test', password: await hashPassword(password) };
  const db = {
    user: {
      findFirst: () => Promise.resolve({ id: USER_ID, accounts: [account] }),
    },
    userTotp: { findUnique: () => Promise.resolve(null) },
    session: { create: () => Promise.resolve() },
  };
  const deps = depsWith(db);

  await expect(
    signInWithEmail(
      deps,
      { email: 'a@b.co', password: password.trim() },
      noop,
      logger
    )
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  await expect(
    signInWithEmail(deps, { email: 'a@b.co', password }, noop, logger)
  ).resolves.toEqual({ type: 'email' });
});

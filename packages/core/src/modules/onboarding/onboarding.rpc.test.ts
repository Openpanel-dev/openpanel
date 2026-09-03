// Only the "is anyone logged in" boundary is exercised here — no database.
// The org+project+client creation rides on @openpanel/db (lazy-loaded
// through ./onboarding.service); wiring this router end-to-end against a
// real Postgres is P6's (protectedProcedure) job, not this one's — see
// onboarding.rpc.ts's header.

import { expect, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import type { CookieOptions } from '../../shared/cookie';
import { onboardingRouter } from './onboarding.rpc';

const COOKIE_OPTIONS: CookieOptions = {
  domain: '.openpanel.dev',
  secure: true,
  sameSite: 'lax',
  httpOnly: true,
  path: '/',
};

// EMPTY_SESSION's shape (packages/db/src/services/auth-session.service.ts) —
// `TrpcContext.session` is never literally `null`, only its `userId` is.
const EMPTY_SESSION = { session: null, user: null, userId: null };

async function anonCaller() {
  const { ctx } = stubHttpCtx({}, EMPTY_SESSION);
  const trpcCtx = await makeTrpcContext(ctx, new Headers(), {
    cookieOptions: COOKIE_OPTIONS,
  });
  return onboardingRouter.createCaller(trpcCtx);
}

test('skipOnboardingCheck answers false without touching a database for an anonymous caller', async () => {
  const caller = await anonCaller();
  await expect(caller.skipOnboardingCheck()).resolves.toEqual({
    canSkip: false,
  });
});

test('project rejects an unauthenticated caller before creating anything', async () => {
  const caller = await anonCaller();
  await expect(
    caller.project({
      organization: 'Acme',
      project: 'website',
      domain: 'https://example.com',
      cors: [],
      website: true,
      app: false,
      backend: false,
    })
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

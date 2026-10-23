// The auth boundaries only; no database.

import { expect, mock, test } from 'bun:test';
import { stubHttpCtx } from '../../../test/rpc-fixtures';
import { makeTrpcContext } from '../../rpc/base';
import { TRPCForbiddenError } from '../../rpc/errors';
import type { Services } from '../../services';
import type { CookieOptions } from '../../shared/cookie';
import { onboardingRouter } from './onboarding.rpc';

const COOKIE_OPTIONS: CookieOptions = {
  domain: '.openpanel.dev',
  secure: true,
  sameSite: 'lax',
  httpOnly: true,
  path: '/',
};

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

test('project refuses an organization member who is not an admin', async () => {
  const requireOrganizationAdmin = mock(() =>
    Promise.reject(
      new TRPCForbiddenError('Only organization admins can create projects')
    )
  );
  const services = {
    auth: {
      getOrganizationAccess: () => Promise.resolve({ role: 'member' }),
      requireOrganizationAdmin,
    },
  } as unknown as Services;
  const { ctx } = stubHttpCtx({ services });
  const trpcCtx = await makeTrpcContext(ctx, new Headers(), {
    cookieOptions: COOKIE_OPTIONS,
  });
  const caller = onboardingRouter.createCaller(trpcCtx);

  await expect(
    caller.project({
      organizationId: 'org_1',
      project: 'website',
      domain: null,
      cors: [],
      website: false,
      app: false,
      backend: true,
    })
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(requireOrganizationAdmin).toHaveBeenCalledWith(
    expect.objectContaining({ userId: 'user_1', organizationId: 'org_1' })
  );
});

// The policies we hang on better-auth, run through its real handler against the
// test database: who may register, where invites are consumed, what stays
// unmounted.

import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import { testCoreConfig } from '../../../../test/config-fixture';
import { testServiceDeps } from '../../../../test/service-deps';
import type { ServiceDeps } from '../../../services';
import { INVITE_HEADER } from '../auth.constants';

const sentEmails: { template: string; to: string; url: string }[] = [];
const sendEmail = mock(
  (template: string, options: { to: string; data: { url: string } }) => {
    sentEmails.push({ template, to: options.to, url: options.data.url });
    return Promise.resolve();
  }
);
mock.module('../../../clients/email', () => ({ sendEmail }));

let createAuth: typeof import('./better-auth').createAuth;
let hashPassword: typeof import('./password').hashPassword;
let constants: typeof import('./better-auth');

const PREFIX = 'ba-test';
/** Creating and migrating the test databases on a fresh runner. */
const BOOTSTRAP_TIMEOUT_MS = 30_000;
const DASHBOARD_URL = 'http://dashboard.test';
const ORG_ID = `${PREFIX}-org`;
const PASSWORD = 'correct horse battery';
const EXISTING_EMAIL = `${PREFIX}-existing@openpanel.test`;
const EXISTING_ID = `${PREFIX}-existing`;
const TWO_FACTOR_EMAIL = `${PREFIX}-2fa@openpanel.test`;
const TWO_FACTOR_ID = `${PREFIX}-2fa`;

let deps: ServiceDeps;
let ipCounter = 0;

function authWith(auth: Partial<ServiceDeps['config']['auth']> = {}) {
  const config = testCoreConfig({ dashboardUrl: DASHBOARD_URL });
  const instance = createAuth({
    db: deps.db,
    logger: deps.logger,
    redis: deps.redis,
    config: {
      ...config,
      auth: {
        ...config.auth,
        secret: 'test-auth-secret-at-least-32-characters',
        trustedOrigins: [DASHBOARD_URL],
        ...auth,
      },
    },
  });
  if (!instance) {
    throw new Error('createAuth returned null with a secret');
  }
  return instance;
}

/** A fresh client IP per call, so better-auth's sign-in limit never trips. */
function call(
  auth: ReturnType<typeof authWith>,
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  ipCounter += 1;
  return auth.handler(
    new Request(`http://api.test${constants.AUTH_BASE_PATH}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: DASHBOARD_URL,
        [constants.TRUSTED_IP_HEADER]: `10.0.0.${ipCounter}`,
        ...headers,
      },
      body: JSON.stringify(body),
    })
  );
}

function lastLoginCookie(response: Response): string | undefined {
  const header = response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith('last-auth-provider='));
  return header?.slice('last-auth-provider='.length, header.indexOf(';'));
}

function cookieNames(response: Response): string[] {
  return response.headers
    .getSetCookie()
    .filter((cookie) => !cookie.includes('Max-Age=0'))
    .map((cookie) => cookie.slice(0, cookie.indexOf('=')));
}

async function createInvite(id: string, email: string) {
  await deps.db.invite.create({
    data: {
      id,
      email,
      organizationId: ORG_ID,
      createdById: EXISTING_ID,
      role: 'viewer',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
}

function membership(userId: string) {
  return deps.db.member.findFirst({
    where: { organizationId: ORG_ID, userId },
    select: { role: true },
  });
}

async function cleanUp() {
  await deps.db.organization.deleteMany({ where: { id: ORG_ID } });
  await deps.db.user.deleteMany({
    where: { email: { startsWith: `${PREFIX}-` } },
  });
}

beforeAll(async () => {
  // A fresh CI shard has no test databases until a suite creates them.
  const { bootstrapTestDatabases } = await import(
    '../../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
  ({ createAuth } = await import('./better-auth'));
  ({ hashPassword } = await import('./password'));
  constants = await import('./better-auth');
  deps = await testServiceDeps();
  await cleanUp();
  const hash = await hashPassword(PASSWORD);
  for (const [id, email, twoFactorEnabled] of [
    [EXISTING_ID, EXISTING_EMAIL, false],
    [TWO_FACTOR_ID, TWO_FACTOR_EMAIL, true],
  ] as const) {
    await deps.db.user.create({
      data: {
        id,
        email,
        name: 'Ada',
        twoFactorEnabled,
        accounts: {
          create: { provider: 'credential', accountId: id, password: hash },
        },
      },
    });
  }
  await deps.db.twoFactor.create({
    data: { userId: TWO_FACTOR_ID, secret: 'unused', backupCodes: 'unused' },
  });
  await deps.db.organization.create({
    data: {
      id: ORG_ID,
      name: 'Better auth test',
      createdByUserId: EXISTING_ID,
    },
  });
}, BOOTSTRAP_TIMEOUT_MS);

afterAll(cleanUp);

test('sign-up creates a credential user with our hash and a joined name', async () => {
  const email = `${PREFIX}-new@openpanel.test`;
  const response = await call(authWith(), '/sign-up/email', {
    email,
    password: PASSWORD,
    name: 'ignored',
    firstName: 'Grace',
    lastName: 'Hopper',
  });

  expect(response.status).toBe(200);
  expect(cookieNames(response)).toContain(constants.AUTH_SESSION_COOKIE);
  const user = await deps.db.user.findUniqueOrThrow({
    where: { email },
    include: { accounts: true },
  });
  expect(user.name).toBe('Grace Hopper');
  expect(user.accounts[0]?.provider).toBe('credential');
  expect(user.accounts[0]?.password?.startsWith('$argon2')).toBe(true);
});

test('sign-up is refused when registration is closed and there is no invite', async () => {
  const email = `${PREFIX}-closed@openpanel.test`;
  const response = await call(
    authWith({ allowRegistration: false }),
    '/sign-up/email',
    { email, password: PASSWORD, name: 'Closed' }
  );

  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({
    code: 'REGISTRATION_NOT_ALLOWED',
  });
  expect(await deps.db.user.findUnique({ where: { email } })).toBeNull();
});

test('an invite opens closed registration and is consumed by the new user', async () => {
  const email = `${PREFIX}-invited@openpanel.test`;
  await createInvite(`${PREFIX}-invite-signup`, email);

  const response = await call(
    authWith({ allowRegistration: false, allowInvitation: true }),
    '/sign-up/email',
    { email, password: PASSWORD, name: 'Invited' },
    { [INVITE_HEADER]: `${PREFIX}-invite-signup` }
  );

  expect(response.status).toBe(200);
  const user = await deps.db.user.findUniqueOrThrow({ where: { email } });
  expect(await membership(user.id)).toEqual({ role: 'viewer' });
  expect(
    await deps.db.invite.findUnique({
      where: { id: `${PREFIX}-invite-signup` },
    })
  ).toBeNull();
});

test('signing in with an invite joins the organization', async () => {
  await createInvite(`${PREFIX}-invite-signin`, EXISTING_EMAIL);

  const response = await call(
    authWith(),
    '/sign-in/email',
    { email: EXISTING_EMAIL, password: PASSWORD },
    { [INVITE_HEADER]: `${PREFIX}-invite-signin` }
  );

  expect(response.status).toBe(200);
  expect(await membership(EXISTING_ID)).toEqual({ role: 'viewer' });
});

test('a password with edge whitespace signs in exactly as it was set', async () => {
  const email = `${PREFIX}-spaces@openpanel.test`;
  const auth = authWith();
  await call(auth, '/sign-up/email', {
    email,
    password: '  spaced out  ',
    name: 'Spaces',
  });

  const trimmed = await call(auth, '/sign-in/email', {
    email,
    password: 'spaced out',
  });
  const exact = await call(auth, '/sign-in/email', {
    email,
    password: '  spaced out  ',
  });

  expect(trimmed.status).toBe(401);
  expect(exact.status).toBe(200);
});

test('a two-factor sign-in has no session yet and keeps the invite for the second step', async () => {
  await createInvite(`${PREFIX}-invite-2fa`, TWO_FACTOR_EMAIL);

  const response = await call(
    authWith(),
    '/sign-in/email',
    { email: TWO_FACTOR_EMAIL, password: PASSWORD },
    { [INVITE_HEADER]: `${PREFIX}-invite-2fa` }
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ twoFactorRedirect: true });
  expect(cookieNames(response)).toContain('inviteId');
  expect(cookieNames(response)).not.toContain(constants.AUTH_SESSION_COOKIE);
  expect(await membership(TWO_FACTOR_ID)).toBeNull();
});

test('a reset link goes to the dashboard and its token sets the new password', async () => {
  const auth = authWith();
  sentEmails.length = 0;
  await call(auth, '/request-password-reset', {
    email: EXISTING_EMAIL,
    redirectTo: `${DASHBOARD_URL}/reset-password`,
  });

  expect(sendEmail).toHaveBeenCalled();
  const url = new URL(sentEmails[0]?.url ?? '');
  expect(url.origin + url.pathname).toBe(`${DASHBOARD_URL}/reset-password`);
  const token = url.searchParams.get('token');

  const reset = await call(auth, '/reset-password', {
    token,
    newPassword: 'a brand new password',
  });
  const signIn = await call(auth, '/sign-in/email', {
    email: EXISTING_EMAIL,
    password: 'a brand new password',
  });

  expect(reset.status).toBe(200);
  expect(signIn.status).toBe(200);
});

test('endpoints the dashboard does not use stay unmounted', async () => {
  const auth = authWith();
  for (const path of ['/list-sessions', '/update-user', '/delete-user']) {
    expect((await call(auth, path, {})).status).toBe(404);
  }
});

const GOOGLE = {
  clientId: 'google-client',
  clientSecret: 'google-secret',
  redirectUri: 'http://api.test/oauth/google/callback',
};

function unsignedIdToken(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.signature`;
}

/** Stubs Google's token endpoint so the callback sees this profile. */
interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified?: boolean;
}

function stubGoogle({ emailVerified = true, ...profile }: GoogleProfile) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (
    input: Request | string | URL,
    init?: RequestInit
  ) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith('https://oauth2.googleapis.com/token')) {
      return realFetch(input, init);
    }
    return Response.json({
      access_token: 'access',
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: unsignedIdToken({
        ...profile,
        email_verified: emailVerified,
        given_name: 'Ada',
        family_name: 'Lovelace',
        iss: 'https://accounts.google.com',
        aud: GOOGLE.clientId,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = realFetch;
  };
}

/** Starts a Google sign-in, then answers its callback; returns where it lands. */
async function googleSignIn(
  auth: ReturnType<typeof authWith>,
  profile: GoogleProfile,
  additionalData?: Record<string, string>
): Promise<{ location: URL; response: Response }> {
  const start = await call(auth, '/sign-in/social', {
    provider: 'google',
    callbackURL: DASHBOARD_URL,
    errorCallbackURL: `${DASHBOARD_URL}/login`,
    additionalData,
  });
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get('state') ?? '';
  const cookie = start.headers
    .getSetCookie()
    .map((header) => header.slice(0, header.indexOf(';')))
    .join('; ');
  const restore = stubGoogle(profile);
  try {
    const response = await auth.handler(
      new Request(
        `http://api.test${constants.AUTH_BASE_PATH}/callback/google?code=code&state=${state}`,
        { headers: { cookie, [constants.TRUSTED_IP_HEADER]: '10.1.0.1' } }
      )
    );
    return {
      response,
      location: new URL(response.headers.get('location') ?? '', DASHBOARD_URL),
    };
  } finally {
    restore();
  }
}

test('Google sends the browser to the redirect URI registered at Google', async () => {
  const start = await call(authWith({ google: GOOGLE }), '/sign-in/social', {
    provider: 'google',
    callbackURL: DASHBOARD_URL,
  });
  const { url } = (await start.json()) as { url: string };
  expect(new URL(url).searchParams.get('redirect_uri')).toBe(
    GOOGLE.redirectUri
  );
});

test('a bulk-imported oauth user signing in with Google gets the account linked', async () => {
  const email = `${PREFIX}-imported@openpanel.test`;
  const user = await deps.db.user.create({
    data: {
      email,
      emailVerified: true,
      accounts: { create: { provider: 'oauth' } },
    },
  });

  const { location, response } = await googleSignIn(
    authWith({ google: GOOGLE }),
    {
      sub: 'google-imported',
      email,
    }
  );

  expect(location.toString()).toBe(`${DASHBOARD_URL}/`);
  expect(lastLoginCookie(response)).toBe('google');
  const google = await deps.db.account.findFirst({
    where: { userId: user.id, provider: 'google' },
  });
  expect(google?.accountId).toBe('google-imported');
});

test('a password-only user is not joined by a Google sign-in with the same email', async () => {
  const { location } = await googleSignIn(authWith({ google: GOOGLE }), {
    sub: 'google-existing',
    email: EXISTING_EMAIL,
  });

  expect(location.pathname).toBe('/login');
  expect(location.searchParams.get('error')).toBe('account_not_linked');
  expect(
    await deps.db.account.count({
      where: { userId: EXISTING_ID, provider: 'google' },
    })
  ).toBe(0);
});

test('a new Google user is refused when registration is closed', async () => {
  const email = `${PREFIX}-google-new@openpanel.test`;
  const { location } = await googleSignIn(
    authWith({ google: GOOGLE, allowRegistration: false }),
    { sub: 'google-new', email }
  );

  expect(location.pathname).toBe('/login');
  expect(location.searchParams.get('error')).toBe('REGISTRATION_NOT_ALLOWED');
  expect(await deps.db.user.findUnique({ where: { email } })).toBeNull();
});

test('a Google sign-up carries its invite through the OAuth state', async () => {
  const email = `${PREFIX}-google-invited@openpanel.test`;
  await createInvite(`${PREFIX}-invite-google`, email);

  const { location, response } = await googleSignIn(
    authWith({ google: GOOGLE, allowRegistration: false }),
    { sub: 'google-invited', email },
    { inviteId: `${PREFIX}-invite-google` }
  );

  expect(location.toString()).toBe(`${DASHBOARD_URL}/`);
  expect(lastLoginCookie(response)).toBe('google');
  const user = await deps.db.user.findUniqueOrThrow({ where: { email } });
  expect(user.firstName).toBe('Ada');
  expect(user.name).toBe('Ada Lovelace');
  expect(await membership(user.id)).toEqual({ role: 'viewer' });
});

test('an unverified Google email does not join the user who owns it', async () => {
  const email = `${PREFIX}-unverified-link@openpanel.test`;
  const user = await deps.db.user.create({
    data: {
      email,
      emailVerified: true,
      accounts: { create: { provider: 'oauth' } },
    },
  });

  const { location } = await googleSignIn(authWith({ google: GOOGLE }), {
    sub: 'google-unverified-link',
    email,
    emailVerified: false,
  });

  expect(location.pathname).toBe('/login');
  expect(location.searchParams.get('error')).toBe('unable_to_get_user_info');
  expect(
    await deps.db.account.count({
      where: { userId: user.id, provider: 'google' },
    })
  ).toBe(0);
});

test('an unverified Google email cannot sign up', async () => {
  const email = `${PREFIX}-unverified-new@openpanel.test`;
  const { location } = await googleSignIn(authWith({ google: GOOGLE }), {
    sub: 'google-unverified-new',
    email,
    emailVerified: false,
  });

  expect(location.searchParams.get('error')).toBe('unable_to_get_user_info');
  expect(await deps.db.user.findUnique({ where: { email } })).toBeNull();
});

test('a provider missing any credential cannot start a sign-in', async () => {
  for (const missing of ['clientId', 'clientSecret', 'redirectUri'] as const) {
    const google = { ...GOOGLE, [missing]: '' };
    const start = await call(authWith({ google }), '/sign-in/social', {
      provider: 'google',
      callbackURL: DASHBOARD_URL,
    });
    expect(start.status).toBe(404);
    expect(cookieNames(start)).toEqual([]);
  }
});

test('GitHub asks only for the scope users already granted', async () => {
  const github = {
    clientId: 'github-client',
    clientSecret: 'github-secret',
    redirectUri: 'http://api.test/oauth/github/callback',
  };
  const start = await call(authWith({ github }), '/sign-in/social', {
    provider: 'github',
    callbackURL: DASHBOARD_URL,
  });
  const { url } = (await start.json()) as { url: string };
  const params = new URL(url).searchParams;
  expect(params.get('scope')).toBe('user:email');
  expect(params.get('redirect_uri')).toBe(github.redirectUri);
});

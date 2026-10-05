// How the `session` cookie is read: a bad one, two of them, and the password
// that produced it.

import {
  apiUrl,
  FRESH_CONTEXT,
  gotoHydrated,
  SHOTS_DIR,
  submitSignIn,
  waitForSignInSlot,
} from './auth-helpers';
import { expect, test } from './fixtures';

test.use({ storageState: FRESH_CONTEXT });
// The dev server hydrates slowly when several suites share it.
test.describe.configure({ timeout: 90_000 });

const STALE_SESSION_TOKEN = 'stalestalestalestalestalestale12';

test('an invalid session cookie is treated as signed out, not as an error', async ({
  page,
  context,
  baseURL,
  seed,
  request,
}) => {
  await context.addCookies([
    { name: 'session', value: 'not-a-session', url: baseURL ?? '' },
  ]);
  await page.goto(`/${seed.organizationId}`);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  const session = await request.get(`${apiUrl()}/trpc/auth.session`, {
    headers: { cookie: 'session=not-a-session' },
  });
  expect(session.status()).toBe(200);
  expect((await session.json()).result.data.json.userId).toBeNull();

  const guarded = await request.get(`${apiUrl()}/trpc/organization.list`, {
    headers: { cookie: 'session=not-a-session' },
  });
  expect(guarded.status()).toBe(401);
});

// Open defect: the API reads only the first `session` value of the Cookie
// header, so a stale cookie ahead of a valid one locks the user out.
test('a stale session cookie next to a fresh one does not block signing in', async ({
  page,
  context,
  baseURL,
  seed,
}) => {
  // Host-only, as a build without a cookie domain set it. Sign-in writes its
  // cookie with `Domain=`, so the browser keeps both and sends the older first.
  await context.addCookies([
    { name: 'session', value: STALE_SESSION_TOKEN, url: baseURL ?? '' },
  ]);
  await gotoHydrated(page, '/login');
  const response = await submitSignIn(page, seed.user);
  expect(response.status()).toBe(200);
  await page.screenshot({ path: `${SHOTS_DIR}/session-two-cookies.png` });
  await expect(page).toHaveURL(new RegExp(`/${seed.organizationId}$`), {
    timeout: 15_000,
  });
});

// Sign-up, reset and sign-in all use the password exactly as typed.
test('a password with a trailing space signs in after signing up with it', async ({
  request,
}) => {
  const email = `e2e-auth-space-${Date.now()}@example.com`;
  const password = 'spaced-password-1 ';
  const signUp = await request.post(`${apiUrl()}/trpc/auth.signUpEmail`, {
    data: {
      json: {
        firstName: 'E2E',
        lastName: 'Auth',
        email,
        password,
        confirmPassword: password,
      },
    },
  });
  expect(signUp.status()).toBe(200);
  try {
    await waitForSignInSlot();
    const signIn = await request.post(`${apiUrl()}/trpc/auth.signInEmail`, {
      data: { json: { email, password } },
    });
    expect(signIn.status()).toBe(200);
  } finally {
    // `request` kept the sign-up's session cookie; the account removes itself.
    const cleanup = await request.post(`${apiUrl()}/trpc/user.delete`, {
      data: {},
    });
    expect(cleanup.status()).toBe(200);
  }
});

// Sign in, sign out and the signed-out redirects. Every test starts without the
// shared auth state and signs in by itself, so the shared session is never touched.

import {
  FRESH_CONTEXT,
  gotoHydrated,
  hasHorizontalOverflow,
  SHOTS_DIR,
  submitSignIn,
  toast,
  waitForHydration,
  watchIssues,
} from './auth-helpers';
import { expect, test } from './fixtures';

test.use({ storageState: FRESH_CONTEXT });
// The dev server hydrates slowly when several suites share it.
test.describe.configure({ timeout: 120_000 });

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const SIGN_IN_REQUEST = '/trpc/auth.signInEmail';

test('signed-out visitors are sent to /login from every protected route', async ({
  page,
  seed,
}) => {
  const issues = watchIssues(page);
  const protectedPaths = [
    '/',
    '/account',
    `/${seed.organizationId}`,
    `/${seed.organizationId}/account`,
    `/${seed.organizationId}/account/two-factor`,
    `/${seed.organizationId}/${seed.projects[0]?.id}/events?foo=1`,
  ];
  for (const path of protectedPaths) {
    await page.goto(path);
    await expect(page, `from ${path}`).toHaveURL(/\/login$/);
  }
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  // The onboarding steps send a signed-out visitor to the sign-up page instead.
  await page.goto('/onboarding/project');
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.goto(`/onboarding/${seed.projects[0]?.id}/connect`);
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.goto(`/onboarding/${seed.projects[0]?.id}/verify`);
  await expect(page).toHaveURL(/\/onboarding$/);

  expect(issues.unexpected()).toEqual([]);
});

test('the login form validates before it calls the API', async ({ page }) => {
  const issues = watchIssues(page);
  let signInRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes(SIGN_IN_REQUEST)) {
      signInRequests += 1;
    }
  });
  await gotoHydrated(page, '/login');

  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Issues')).toHaveCount(2);
  await page.getByText('Issues').first().hover();
  await expect(page.getByRole('tooltip')).toContainText(
    'Invalid email address'
  );

  await page.getByLabel('Email').fill('not-an-email');
  await page.getByLabel('Password').fill('short');
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByText('Issues')).toHaveCount(2);

  await page.getByLabel('Email').fill('someone@example.com');
  await page.getByLabel('Password').fill('long-enough-password');
  await page.getByLabel('Email').press('Tab');
  await expect(page.getByText('Issues')).toHaveCount(0);

  await expect(
    page.getByRole('link', { name: 'Create one today' })
  ).toHaveAttribute('href', '/onboarding');
  expect(signInRequests).toBe(0);
  await expect(page).toHaveURL(/\/login$/);
  expect(issues.unexpected()).toEqual([]);
});

test('a wrong password and an unknown email are both refused', async ({
  page,
  seed,
}) => {
  const issues = watchIssues(page);
  await gotoHydrated(page, '/login');

  const wrongPassword = await submitSignIn(page, {
    email: seed.user.email,
    password: 'definitely-not-the-password',
  });
  // 400, not 401: the dashboard reads any 401 as "signed out" and redirects.
  expect(wrongPassword.status()).toBe(400);
  await expect(toast(page, 'Incorrect email or password')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await page.screenshot({ path: `${SHOTS_DIR}/login-wrong-password.png` });

  const unknownEmail = await submitSignIn(page, {
    email: `nobody-${Date.now()}@example.com`,
    password: 'definitely-not-the-password',
  });
  expect(unknownEmail.status()).toBeGreaterThanOrEqual(400);
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (await page.context().cookies()).map((cookie) => cookie.name)
  ).not.toContain('session');
  expect(issues.unexpected([/auth\.signInEmail/])).toEqual([]);
});

test('sign in, land on the organization, then log out from the profile menu', async ({
  page,
  context,
  seed,
  request,
}) => {
  const issues = watchIssues(page);
  await gotoHydrated(page, '/login');
  await expect(page.getByText('Used last time')).toHaveCount(0);

  const response = await submitSignIn(page, seed.user);
  expect(response.status()).toBe(200);
  // One organization: `/` forwards straight to it.
  await expect(page).toHaveURL(new RegExp(`/${seed.organizationId}$`), {
    timeout: 20_000,
  });

  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === 'session');
  expect(session).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
  });
  const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;
  expect(session?.expires).toBeGreaterThan(
    Date.now() / 1000 + THIRTY_DAYS_IN_SECONDS - 120
  );
  expect(
    cookies.find((cookie) => cookie.name === 'last-auth-provider')?.value
  ).toBe('email');

  // The pages for signed-out visitors forward a signed-in one to the app.
  for (const path of ['/login', '/onboarding', '/reset-password?token=x']) {
    await page.goto(path);
    await expect(page, `from ${path}`).toHaveURL(
      new RegExp(`/${seed.organizationId}$`)
    );
  }

  await waitForHydration(page);
  await page.getByRole('button', { name: 'Profile' }).click();
  await expect(page.getByRole('menuitem', { name: 'Account' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // The provider hint survives the logout, the session does not.
  await expect(page.getByText('Used last time')).toBeVisible();
  await page.screenshot({ path: `${SHOTS_DIR}/login-used-last-time.png` });
  const afterLogout = (await context.cookies()).map((cookie) => cookie.name);
  expect(afterLogout).not.toContain('session');
  await page.goto(`/${seed.organizationId}`);
  await expect(page).toHaveURL(/\/login$/);

  // The server forgot the session too: replaying the old cookie is anonymous.
  const replay = await request.get(
    `${new URL(response.url()).origin}/trpc/auth.session`,
    { headers: { cookie: `session=${session?.value}` } }
  );
  expect((await replay.json()).result.data.json.userId).toBeNull();
  expect(issues.unexpected()).toEqual([]);
});

test('the login and sign-up pages fit a phone screen', async ({ page }) => {
  await page.setViewportSize(MOBILE_VIEWPORT);
  for (const path of ['/login', '/onboarding']) {
    await gotoHydrated(page, path);
    expect(await hasHorizontalOverflow(page), path).toBe(false);
    await page.screenshot({
      path: `${SHOTS_DIR}/mobile${path.replace('/', '-')}.png`,
      fullPage: true,
    });
  }
  await page.goto('/login');
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true })
  ).toBeInViewport();
});

// Until React hydrates, a submit is native: without `method="post"` it would be
// a GET to /login?email=…&password=….
test('a submit before hydration never puts the password in the URL', async ({
  page,
  baseURL,
}) => {
  const dashboardHost = new URL(baseURL ?? '').hostname;
  // The document and its inline scripts arrive, the client bundle does not:
  // the state every visitor is in until hydration finishes.
  await page.route(
    (url) => url.hostname === dashboardHost,
    (route) =>
      route.request().resourceType() === 'script'
        ? route.abort()
        : route.continue()
  );
  await page.goto('/login');
  await page.getByLabel('Email').fill('someone@example.com');
  await page.getByLabel('Password').fill('super-secret-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForLoadState('load');
  expect(page.url()).not.toContain('super-secret-password');
});

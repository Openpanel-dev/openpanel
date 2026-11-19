// What a signed-out visitor is offered with registration open and closed. The
// closed half needs an api started with ALLOW_REGISTRATION=false and at least
// one user, and this run's shell carrying the same variable.

import { FRESH_CONTEXT, gotoHydrated, SHOTS_DIR } from './auth-helpers';
import { expect, test } from './fixtures';

test.use({ storageState: FRESH_CONTEXT });
// The dev server hydrates slowly when several suites share it.
test.describe.configure({ timeout: 120_000 });

const REGISTRATION_CLOSED = process.env.ALLOW_REGISTRATION === 'false';
const UNKNOWN_INVITE_ID = 'not-a-real-invite';

test.describe('registration open', () => {
  test.skip(REGISTRATION_CLOSED, 'needs an api with registration open');

  test('login links to sign-up, and sign-up shows its form', async ({
    page,
  }) => {
    await gotoHydrated(page, '/login');
    await page.getByRole('link', { name: 'Create an account' }).click();

    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(
      page.getByRole('heading', { name: 'Create your account' })
    ).toBeVisible();
  });
});

test.describe('registration closed', () => {
  test.skip(!REGISTRATION_CLOSED, 'needs ALLOW_REGISTRATION=false');

  test('login offers no sign-up and keeps the sign-in options', async ({
    page,
  }) => {
    await gotoHydrated(page, '/login');

    await expect(
      page.getByRole('heading', { name: 'Welcome back' })
    ).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Create an account' })
    ).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS_DIR}/registration-closed.png` });
  });

  test('sign-up redirects to login', async ({ page }) => {
    await page.goto('/onboarding');

    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole('heading', { name: 'Create your account' })
    ).toHaveCount(0);
  });

  test('an invite that cannot register lands on login and keeps its id', async ({
    page,
  }) => {
    await page.goto(`/invite/${UNKNOWN_INVITE_ID}`);

    await expect(page).toHaveURL(
      new RegExp(`/login\\?inviteId=${UNKNOWN_INVITE_ID}$`)
    );
    await expect(
      page.getByRole('heading', { name: 'Welcome back' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Create an account' })
    ).toHaveCount(0);
  });
});

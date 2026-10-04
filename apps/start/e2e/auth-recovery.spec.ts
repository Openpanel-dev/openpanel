// Forgot password, /reset-password and /unsubscribe as a signed-out visitor.
// No email is delivered here; the reset that needs a real token is in
// auth-onboarding.spec.ts, which reads it from the database.

import {
  FRESH_CONTEXT,
  gotoHydrated,
  SHOTS_DIR,
  toast,
  watchIssues,
} from './auth-helpers';
import { expect, test } from './fixtures';

test.use({ storageState: FRESH_CONTEXT });
// The dev server hydrates slowly when several suites share it.
test.describe.configure({ timeout: 90_000 });

const RESET_REQUEST = '/trpc/auth.resetPassword';
const UNKNOWN_TOKEN = 'pw_e2e-does-not-exist';

test('the forgot password modal validates and answers the same for an unknown email', async ({
  page,
}) => {
  const issues = watchIssues(page);
  await gotoHydrated(page, '/login');
  const typedEmail = `nobody-${Date.now()}@example.com`;
  await page.getByLabel('Email').fill(typedEmail);

  await page.getByRole('button', { name: 'Forgot password?' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Request password reset' })
  ).toBeVisible();
  const email = dialog.getByPlaceholder('Your email address');
  // The address already typed in the login form is carried over.
  await expect(email).toHaveValue(typedEmail);

  await email.fill('not-an-email');
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog.getByText('Issues')).toBeVisible();
  await page.screenshot({ path: `${SHOTS_DIR}/forgot-password-invalid.png` });

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await email.fill(typedEmail);
  await email.press('Enter');
  // Never "no such user": the endpoint must not reveal who has an account.
  await expect(
    toast(page, 'You should receive an email shortly!')
  ).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(issues.unexpected()).toEqual([]);
});

test('/reset-password without a token explains what is wrong', async ({
  page,
}) => {
  await page.goto('/reset-password');
  await expect(page.getByText('Missing reset password token')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Reset password' })
  ).toHaveCount(0);
});

test('/reset-password refuses an unknown token and keeps the visitor on the page', async ({
  page,
}) => {
  const issues = watchIssues(page);
  await gotoHydrated(page, `/reset-password?token=${UNKNOWN_TOKEN}`);
  await expect(
    page.getByRole('heading', { name: 'Reset your password' })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/login'
  );

  await page.getByLabel('New password').fill('a-perfectly-fine-password');
  const answer = page.waitForResponse((response) =>
    response.url().includes(RESET_REQUEST)
  );
  await page.getByLabel('New password').press('Enter');
  expect((await answer).status()).toBe(404);
  await expect(toast(page, 'Reset password not found')).toBeVisible();
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  expect(issues.unexpected([/auth\.resetPassword/])).toEqual([]);
});

// BUG "Reset password form swallows validation errors": the input is rendered
// without the `error` prop, so a too-short password makes the button do nothing.
test('/reset-password tells the visitor when the new password is too short', async ({
  page,
}) => {
  let resetRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes(RESET_REQUEST)) {
      resetRequests += 1;
    }
  });
  await gotoHydrated(page, `/reset-password?token=${UNKNOWN_TOKEN}`);
  await page.getByLabel('New password').fill('short');
  await page.getByRole('button', { name: 'Reset password' }).click();
  expect(resetRequests).toBe(0);
  await expect(page.getByText('Issues')).toBeVisible();
});

test('/unsubscribe with missing or malformed parameters shows a friendly page', async ({
  page,
}) => {
  for (const query of [
    '',
    '?email=a%40example.com',
    '?email=not-an-email&category=onboarding&token=x',
  ]) {
    await page.goto(`/unsubscribe${query}`);
    await expect(page.getByText('Link not valid'), query).toBeVisible();
    await expect(page.getByText('"code"')).toHaveCount(0);
  }
  await page.screenshot({ path: `${SHOTS_DIR}/unsubscribe-invalid.png` });
});

test('/unsubscribe with a forged token refuses and says so', async ({
  page,
}) => {
  const issues = watchIssues(page);
  await gotoHydrated(
    page,
    '/unsubscribe?email=a%40example.com&category=onboarding&token=forged'
  );
  await expect(
    page.getByText('Unsubscribe from Onboarding emails?')
  ).toBeVisible();
  await expect(page.getByText('a@example.com')).toBeVisible();

  const answer = page.waitForResponse((response) =>
    response.url().includes('/trpc/email.unsubscribe')
  );
  await page.getByRole('button', { name: 'Confirm Unsubscribe' }).click();
  expect((await answer).status()).toBe(400);
  await expect(page.getByText('Invalid unsubscribe link')).toBeVisible();
  await expect(page.getByText('Unsubscribed', { exact: true })).toHaveCount(0);
  expect(issues.unexpected([/email\.unsubscribe/])).toEqual([]);

  // Cancel leaves for the app, which sends a signed-out visitor to /login.
  await page.getByRole('link', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

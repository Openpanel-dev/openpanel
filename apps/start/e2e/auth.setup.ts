// Logs in once through the real form and saves the session cookie; every
// other spec starts authenticated (Playwright's storageState pattern).

import { expect, test as setup } from '@playwright/test';
import { readSeedManifest } from './seed-manifest';

const AUTH_STATE_FILE = 'e2e/.auth/user.json';

setup('sign in as the seeded user', async ({ page }) => {
  const manifest = readSeedManifest();
  await page.goto('/login');
  // The form is server-rendered; a click before hydration submits it natively as a GET.
  await page.waitForLoadState('networkidle');
  await page.getByLabel('Email').fill(manifest.user.email);
  await page.getByLabel('Password').fill(manifest.user.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${manifest.organizationId}`), {
    timeout: 15_000,
  });
  await page.context().storageState({ path: AUTH_STATE_FILE });
});

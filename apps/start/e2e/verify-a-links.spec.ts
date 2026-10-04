import { expect, test } from './fixtures';
import { openHydrated, SHOTS_DIR } from './verify-a-helpers';

const GSC_DOCS_URL =
  'https://openpanel.dev/docs/self-hosting/google-search-console';
const SUPPORTER_URL = /^https:\/\/buy\.polar\.sh\//;
// seroval encodes `false` as {"t":2,"s":3} and `true` as {"t":2,"s":2}; the
// first boolean in the env payload is `isSelfHosted`.
const SEROVAL_FALSE = '{"t":2,"s":3}';
const SEROVAL_TRUE = '{"t":2,"s":2}';

test('the Search Console setup guide button links to the docs', async ({
  page,
}) => {
  // The button only renders when the instance has no Google OAuth client.
  await page.route('**/trpc/auth.providers**', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace('"gsc":true', '"gsc":false');
    await route.fulfill({ response, body });
  });
  await openHydrated(page, '/acme/acme-shop/settings/gsc');
  const link = page.getByRole('link', { name: 'Read the setup guide' });
  await expect(link).toBeVisible();
  await page.screenshot({ path: `${SHOTS_DIR}/gsc-setup-guide.png` });
  await expect(link).toHaveAttribute('href', GSC_DOCS_URL);
});

test('the self-hosted supporter button links to the checkout page', async ({
  page,
}) => {
  await page.route('**/_serverFn/**getServerEnvs**', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(SEROVAL_FALSE, SEROVAL_TRUE);
    await route.fulfill({ response, body });
  });
  await page.context().clearCookies({ name: 'supporter-prompt-closed' });
  await page.goto('/acme');
  await page.waitForLoadState('networkidle');
  const link = page.getByRole('link', { name: 'Become a Supporter' });
  await expect(link).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS_DIR}/supporter-prompt.png` });
  await expect(link).toHaveAttribute('href', SUPPORTER_URL);
});

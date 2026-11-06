import { expect, test } from './fixtures';

const PROJECT = 'acme-saas';
const REFERRER_HOST = 'e2e-realtime.example';
const REFERRER_URL = `https://www.${REFERRER_HOST}/deep/path?utm=1#top`;
const INGEST_TIMEOUT_MS = 30_000;

test.use({ actionTimeout: 20_000 });

test.beforeAll(async ({ request }) => {
  const { readSeedManifest } = await import('./seed-manifest');
  const project = readSeedManifest().projects.find(
    (candidate) => candidate.id === PROJECT
  );
  const response = await request.post(`${process.env.API_URL}/track`, {
    headers: {
      'openpanel-client-id': project?.clientId ?? '',
      'openpanel-client-secret': project?.clientSecret ?? '',
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36',
      'x-client-ip': '81.2.69.200',
    },
    data: {
      type: 'track',
      payload: {
        name: 'screen_view',
        properties: {
          __path: 'https://acme.test/realtime-e2e',
          __referrer: REFERRER_URL,
        },
      },
    },
  });
  expect(response.ok()).toBe(true);
});

test.beforeEach(async ({ page, seed }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/${seed.organizationId}/${PROJECT}/realtime`);
});

test('referrers show as hostnames and filter the page', async ({ page }) => {
  const option = page.getByRole('menuitemcheckbox', { name: REFERRER_HOST });
  await expect(async () => {
    await page.reload();
    // Rendered after mount, so a click on the menu below reaches a live page.
    await expect(page.getByRole('button', { name: 'Customize' })).toBeVisible();
    await page.getByRole('button', { name: 'Referrer' }).click();
    await expect(option).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: INGEST_TIMEOUT_MS });
  await expect(page.getByText(REFERRER_URL)).toHaveCount(0);

  await option.click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(new RegExp(`referrer=${REFERRER_HOST}`));

  const islandItem = page.getByRole('button', {
    name: REFERRER_HOST,
    exact: false,
    pressed: true,
  });
  await expect(islandItem).toBeVisible();

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page).not.toHaveURL(/referrer=/);
});

test('a widget can be moved and the layout survives a reload', async ({
  page,
}) => {
  await expect(page.getByRole('region', { name: 'People' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Customize' }).click();
  await page
    .getByRole('group', { name: 'Where to show People' })
    .getByRole('radio', { name: 'Right' })
    .click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'People' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('region', { name: 'People' })).toBeVisible();

  await page.getByRole('button', { name: 'Customize' }).click();
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'People' })).toHaveCount(0);
});

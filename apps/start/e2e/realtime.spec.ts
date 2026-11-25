import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const PROJECT = 'acme-saas';
const REFERRER_HOST = 'e2e-realtime.example';
const REFERRER_URL = `https://www.${REFERRER_HOST}/deep/path?utm=1#top`;
const OTHER_REFERRER_HOST = 'e2e-realtime-other.example';
const INGEST_TIMEOUT_MS = 30_000;

test.use({ actionTimeout: 20_000 });

test.beforeAll(async ({ request }) => {
  const { readSeedManifest } = await import('./seed-manifest');
  const project = readSeedManifest().projects.find(
    (candidate) => candidate.id === PROJECT
  );
  const visits = [
    { referrer: REFERRER_URL, ip: '81.2.69.200' },
    { referrer: `https://${OTHER_REFERRER_HOST}/post`, ip: '81.2.69.201' },
  ];

  for (const [index, visit] of visits.entries()) {
    const response = await request.post(`${process.env.API_URL}/track`, {
      headers: {
        'openpanel-client-id': project?.clientId ?? '',
        'openpanel-client-secret': project?.clientSecret ?? '',
        'user-agent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0.${index}.0 Safari/537.36`,
        'x-client-ip': visit.ip,
      },
      data: {
        type: 'track',
        payload: {
          name: 'screen_view',
          properties: {
            __path: 'https://acme.test/realtime-e2e',
            __referrer: visit.referrer,
          },
        },
      },
    });
    expect(response.ok()).toBe(true);
  }
});

test.beforeEach(async ({ page, seed }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/${seed.organizationId}/${PROJECT}/realtime`);
});

function referrerInBar(page: Page, host: string) {
  return page.getByRole('button', { name: host, exact: false });
}

function peopleIn(page: Page, column: 'Left column' | 'Right column') {
  return page
    .getByRole('complementary', { name: column })
    .getByRole('region', { name: 'People' });
}

test('referrers show as hostnames and filter the page', async ({ page }) => {
  const option = page.getByRole('menuitemcheckbox', { name: REFERRER_HOST });
  await expect(async () => {
    await page.reload();
    // Rendered after mount, so a click on the menu below reaches a live page.
    await expect(page.getByRole('button', { name: 'Customize' })).toBeVisible();
    await page.getByRole('button', { name: 'Referrer' }).click();
    await expect(option).toBeVisible({ timeout: 3000 });
    await expect(
      page.getByRole('menuitemcheckbox', { name: OTHER_REFERRER_HOST })
    ).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: INGEST_TIMEOUT_MS });
  await expect(page.getByText(REFERRER_URL)).toHaveCount(0);

  await option.click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(new RegExp(`referrer=${REFERRER_HOST}`));

  await expect(
    page.getByRole('button', { name: REFERRER_HOST, pressed: true })
  ).toBeVisible();
  await expect(referrerInBar(page, OTHER_REFERRER_HOST)).toHaveCount(0);

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
  await expect(peopleIn(page, 'Right column')).toBeVisible();
  await expect(peopleIn(page, 'Left column')).toHaveCount(0);

  await page.reload();
  await expect(peopleIn(page, 'Right column')).toBeVisible();

  await page.getByRole('button', { name: 'Customize' }).click();
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'People' })).toHaveCount(0);
});

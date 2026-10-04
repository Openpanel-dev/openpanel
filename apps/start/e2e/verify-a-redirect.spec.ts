import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const SAAS = '/acme/acme-saas';
const SETTLE_MS = 5000;
const SLOW_SERVER_FN_MS = 1500;
const CLICK_GAP_MS = 700;

function pathTrail(page: Page) {
  const trail: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      trail.push(new URL(frame.url()).pathname);
    }
  });
  return trail;
}

async function openHydrated(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  // The project switcher only gets its label once the client has hydrated.
  await expect(page.getByRole('combobox').first()).toContainText('Acme', {
    timeout: 45_000,
  });
}

test.describe('overlapping navigations never bounce a signed-in user through /login', () => {
  test('Back pressed twice in a row returns two pages back', async ({
    page,
  }) => {
    const trail = pathTrail(page);
    await openHydrated(page, `${SAAS}/events`);
    await page.getByRole('link', { name: 'Groups', exact: true }).click();
    await expect(page).toHaveURL(/\/groups$/);
    await page.getByRole('link', { name: 'Cohorts', exact: true }).click();
    await expect(page).toHaveURL(/\/cohorts$/);
    await page.goBack();
    await page.goBack();
    await page.waitForTimeout(SETTLE_MS);
    expect(trail).not.toContain('/login');
    await expect(page).toHaveURL(/\/acme\/acme-saas\/events/);
  });

  test('session detail -> reload -> profile -> Back -> Back returns to the sessions list', async ({
    page,
  }) => {
    const trail = pathTrail(page);
    await openHydrated(page, `${SAAS}/sessions`);
    await page
      .locator('[data-index]')
      .first()
      .locator('a[href*="/sessions/"]')
      .first()
      .click();
    await expect(page.getByText('Session info')).toBeVisible();
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Session info')).toBeVisible();
    await page.getByRole('link', { name: /@/ }).click();
    await expect(page).toHaveURL(/\/profiles\/[^/]+$/);
    await page.goBack();
    await page.goBack();
    await page.waitForTimeout(SETTLE_MS);
    expect(trail).not.toContain('/login');
    await expect(page).toHaveURL(/\/acme\/acme-saas\/sessions$/);
  });

  test('sidebar navigation on a slow connection stays in the project', async ({
    page,
  }) => {
    const trail = pathTrail(page);
    await openHydrated(page, `${SAAS}/sessions`);
    // The root route awaits this server function on every navigation.
    await page.route('**/_serverFn/**getCookiesFn**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, SLOW_SERVER_FN_MS));
      await route.continue();
    });
    for (const name of ['Events', 'Groups', 'Cohorts', 'Profiles', 'Pages']) {
      await page.getByRole('link', { name, exact: true }).click();
      await page.waitForTimeout(CLICK_GAP_MS);
    }
    await page.waitForTimeout(SETTLE_MS + SLOW_SERVER_FN_MS);
    expect(trail).not.toContain('/login');
    await expect(page).toHaveURL(/\/acme\/acme-saas\/pages$/);
  });
});

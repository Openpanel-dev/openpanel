import type { Page } from '@playwright/test';
import { expect as baseExpect, test } from './fixtures';

// The dev server shares a machine with other suites; default timeouts are too tight.
const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ timeout: 240_000 });

const SHOTS = 'test-results/data/shots';
const SHOP = '/acme/acme-shop';
const SAAS = '/acme/acme-saas';
const WEB = '/acme/acme-web';
const NOISE = [
  /api\.openpanel\.dev/,
  /favicon/,
  /sentry/i,
  /\[vite\]/,
  /Failed to load resource/,
  // The sidebar's AI composer input (not this surface) differs in a `style` attribute.
  /A tree hydrated but some attributes/,
  /requires a `DialogTitle`/,
];

function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') {
      return;
    }
    const text = message.text();
    if (!NOISE.some((pattern) => pattern.test(text))) {
      problems.push(`console: ${text.slice(0, 400)}`);
    }
  });
  page.on('pageerror', (error) => {
    problems.push(`pageerror: ${error.message.slice(0, 400)}`);
  });
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() >= 400 && !NOISE.some((p) => p.test(url))) {
      problems.push(`http ${response.status()}: ${url.slice(0, 200)}`);
    }
  });
  return problems;
}

async function hydrated(page: Page) {
  await page.waitForLoadState('networkidle');
  // The project switcher only gets its label once the client has hydrated.
  await expect(page.getByRole('combobox').first()).toContainText('Acme', {
    timeout: 45_000,
  });
}

async function open(page: Page, path: string) {
  await page.context().addCookies([
    {
      name: 'feedback-prompt-seen',
      value: new Date().toISOString(),
      url: process.env.DASHBOARD_URL ?? 'http://localhost:3000',
    },
  ]);
  for (const attempt of [1, 2, 3]) {
    await page.goto(path);
    try {
      await hydrated(page);
      return;
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
    }
  }
}

const rows = (page: Page) => page.locator('[data-index]');
const tableRows = (page: Page) => page.locator('tbody tr');

test.describe('sessions', () => {
  test('list renders, scrolls to the next page and searches', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page, `${SHOP}/sessions`);
    await expect(rows(page).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/sessions-list.png` });

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect
      .poll(() =>
        rows(page).evaluateAll((elements) =>
          Math.max(
            ...elements.map((el) => Number(el.getAttribute('data-index')))
          )
        )
      )
      .toBeGreaterThan(49);
    await page.evaluate(() => window.scrollTo(0, 0));

    await page.getByPlaceholder(/Search/).fill('/checkout');
    await expect(page).toHaveURL(/search=/);
    await page.waitForLoadState('networkidle');
    await expect(rows(page).first().locator('a').first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/sessions-search.png` });
    const texts = await rows(page).allInnerTexts();
    for (const text of texts.slice(0, 10)) {
      expect(text).toContain('/checkout');
    }

    await page.getByPlaceholder(/Search/).fill('zzz-no-such-session');
    await expect(page.getByText('No sessions found')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/sessions-empty.png` });
    expect(problems).toEqual([]);
  });

  test('bounce filter narrows the list and survives reload', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page, `${SHOP}/sessions`);
    await page.getByRole('button', { name: 'Filters' }).click();
    await page.getByRole('button', { name: 'Add filter' }).click();
    await page.screenshot({ path: `${SHOTS}/sessions-filter-categories.png` });
    await page.getByText('Session metrics', { exact: true }).click();
    await page.getByText('Bounced', { exact: true }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/sessions-filter-bounced.png` });
    await page.getByRole('combobox').filter({ hasText: 'Yes / No' }).click();
    await page.screenshot({
      path: `${SHOTS}/sessions-filter-bounced-value.png`,
    });
    await page.getByRole('option', { name: 'Yes', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/f=session\.is_bounce/);
    await page.waitForLoadState('networkidle');
    await expect(rows(page).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/sessions-filtered.png` });
    const bounceCells = await rows(page).allInnerTexts();
    expect(bounceCells.length).toBeGreaterThan(0);
    for (const text of bounceCells.slice(0, 15)) {
      expect(text).toMatch(/\bYes\b/);
    }
    await page.reload();
    await hydrated(page);
    await expect(page).toHaveURL(/f=session\.is_bounce/);
    await expect(rows(page).first()).toContainText('Yes');
    expect(problems).toEqual([]);
  });

  test('hiding a column persists across reload', async ({ page }) => {
    await open(page, `${SHOP}/sessions`);
    await page.getByRole('combobox', { name: 'Toggle columns' }).click();
    const header = page
      .locator('.sticky')
      .getByText('Entry Page', { exact: true });
    await expect(header).toBeVisible();
    await page.getByRole('option', { name: 'Entry Page' }).click();
    await page.keyboard.press('Escape');
    await expect(header).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/sessions-view.png` });
    await page.reload();
    await hydrated(page);
    await expect(rows(page).first().locator('a').first()).toBeVisible();
    await expect(header).toHaveCount(0);
  });

  test('detail page shows the timeline and links to the profile', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page, `${SAAS}/sessions`);
    await expect(rows(page).first()).toBeVisible();
    const firstRow = rows(page).first();
    await firstRow.locator('a[href*="/sessions/"]').first().click();
    await expect(page).toHaveURL(/\/sessions\/[^/]+$/);
    await expect(
      page.getByRole('heading', { name: /^Session: / })
    ).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: `${SHOTS}/session-detail.png`,
      fullPage: true,
    });
    await expect(page.getByText('Session info')).toBeVisible();
    await expect(page.getByText('Visited pages')).toBeVisible();
    await expect(page.getByText('Event distribution')).toBeVisible();

    await page.reload();
    await hydrated(page);
    await expect(page.getByText('Session info')).toBeVisible();

    await page.getByRole('link', { name: /@/ }).click();
    await expect(page).toHaveURL(/\/profiles\/[^/]+$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/sessions\/[^/]+$/);
    await expect(page.getByText('Session info')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/sessions$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/sessions\/[^/]+$/);
    expect(problems).toEqual([]);
  });

  test('browser back from a list reached through the sidebar returns to the previous page', async ({
    page,
  }) => {
    await open(page, `${SAAS}/sessions`);
    await page.getByRole('link', { name: 'Profiles', exact: true }).click();
    await expect(page).toHaveURL(/\/profiles\/identified/);
    await page.goBack();
    await expect(page).toHaveURL(/\/sessions$/);
    await page.getByRole('link', { name: 'Events', exact: true }).click();
    await expect(page).toHaveURL(/\/events\/events/);
    await page.goBack();
    await expect(page).toHaveURL(/\/sessions$/);
  });

  test('an unknown session id shows a not-found state inside the app', async ({
    page,
  }) => {
    await page.goto(`${SHOP}/sessions/does-not-exist`);
    await expect(page.getByText(/not found/i).first()).toBeVisible({
      timeout: 60_000,
    });
    await page.screenshot({ path: `${SHOTS}/session-not-found.png` });
    await expect(page.getByText('Something went wrong')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Sessions' })).toBeVisible();
  });

  test('mobile viewport has no horizontal page scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, `${SHOP}/sessions`);
    await expect(rows(page).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/sessions-mobile.png` });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('profiles', () => {
  test('identified tab lists, searches and paginates', async ({ page }) => {
    const problems = watch(page);
    await open(page, `${SAAS}/profiles`);
    await expect(page).toHaveURL(/\/profiles\/identified/);
    await expect(tableRows(page).first()).toBeVisible();
    await page.screenshot({
      path: `${SHOTS}/profiles-identified.png`,
      fullPage: true,
    });
    expect(await tableRows(page).count()).toBe(50);
    const firstName = await tableRows(page)
      .first()
      .locator('a')
      .first()
      .innerText();

    await page.locator('button:has(svg.lucide-chevron-right)').click();
    await expect(page).toHaveURL(/page=2/);
    await expect(tableRows(page).first().locator('a').first()).not.toHaveText(
      firstName
    );
    await page.reload();
    await hydrated(page);
    await expect(page).toHaveURL(/page=2/);
    await expect(tableRows(page).first()).toBeVisible();
    await expect(tableRows(page).first().locator('a').first()).not.toHaveText(
      firstName
    );

    const lastName = firstName.split(' ').pop() ?? firstName;
    await page.getByPlaceholder('Search profiles').fill(lastName);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/profiles-search.png` });
    await expect(tableRows(page).first()).toContainText(lastName);
    expect(problems).toEqual([]);
  });

  test('anonymous and power-user tabs list profiles', async ({ page }) => {
    const problems = watch(page);
    await open(page, `${WEB}/profiles`);
    await page.getByRole('tab', { name: 'Anonymous' }).click();
    await expect(page).toHaveURL(/\/profiles\/anonymous/);
    await expect(tableRows(page).first().locator('a').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/profiles-anonymous.png` });
    await page.getByRole('tab', { name: 'Power users' }).click();
    await expect(page).toHaveURL(/\/profiles\/power-users/);
    await expect(tableRows(page).first().locator('a').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: `${SHOTS}/profiles-power-users.png`,
      fullPage: true,
    });
    expect(problems).toEqual([]);
  });

  test('search on the power-users tab filters the list', async ({ page }) => {
    await open(page, `${SAAS}/profiles/power-users`);
    const names = tableRows(page).locator('a');
    await expect(names.first()).toBeVisible();
    const before = await tableRows(page).count();
    await page.getByPlaceholder('Search profiles').fill('zzz-no-such-profile');
    await expect(page).toHaveURL(/search=/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/profiles-power-search.png` });
    expect(await names.count()).toBeLessThan(before);
  });

  test('detail page shows metrics, properties, activity and tabs', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page, `${SAAS}/profiles`);
    await tableRows(page).first().locator('a').first().click();
    await expect(page).toHaveURL(/\/profiles\/[^/]+$/);
    await hydrated(page);
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: `${SHOTS}/profile-detail.png`,
      fullPage: true,
    });
    for (const widget of [
      'Profile Information',
      'Activity',
      'Latest Events',
      'Popular events',
      'Most visited pages',
      'Page views',
      'Events per day',
    ]) {
      await expect(page.getByText(widget, { exact: true })).toBeVisible();
    }

    await page.getByRole('tab', { name: 'Events' }).click();
    await expect(page).toHaveURL(/\/profiles\/[^/]+\/events/);
    await expect(rows(page).first().locator('button[title]')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/profile-events.png` });

    await page.getByRole('tab', { name: 'Sessions' }).click();
    await expect(page).toHaveURL(/\/profiles\/[^/]+\/sessions/);
    await expect(rows(page).first().locator('a').first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/profile-sessions.png` });

    await rows(page).first().locator('a[href*="/sessions/"]').first().click();
    await expect(page).toHaveURL(/\/sessions\/[^/]+$/);
    await expect(page.getByText('Session info')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/profiles\/[^/]+\/sessions/);
    await page.reload();
    await hydrated(page);
    await expect(rows(page).first()).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('an unknown profile id shows a not-found state', async ({ page }) => {
    await open(page, `${SHOP}/profiles/does-not-exist`);
    await page.screenshot({
      path: `${SHOTS}/profile-not-found.png`,
      fullPage: true,
    });
    await expect(page.getByText(/not found/i).first()).toBeVisible();
  });

  test("metrics agree with the profile's sessions", async ({ page }) => {
    await open(page, `${SAAS}/profiles`);
    await tableRows(page).first().locator('a').first().click();
    await expect(page).toHaveURL(/\/profiles\/[^/]+$/);
    await hydrated(page);
    const sessionsCard = page
      .locator('div', { hasText: /^Sessions/ })
      .filter({ hasText: 'Total' })
      .last();
    const shown = Number((await sessionsCard.innerText()).match(/\d+/)?.[0]);
    await page.getByRole('tab', { name: 'Sessions' }).click();
    const sessionLinks = page.locator('[data-index] a[href*="/sessions/"]');
    await expect(sessionLinks.first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    const listed = await rows(page).count();
    expect(shown).toBe(listed);
  });

  test('mobile viewport has no horizontal page scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, `${SAAS}/profiles`);
    await expect(tableRows(page).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/profiles-mobile.png` });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

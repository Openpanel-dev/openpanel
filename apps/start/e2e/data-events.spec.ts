import type { Page } from '@playwright/test';
import { expect as baseExpect, test } from './fixtures';

// The dev server shares a machine with other suites; default timeouts are too tight.
const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ timeout: 240_000 });

const SHOTS = 'test-results/data/shots';
const SHOP = '/acme/acme-shop';
const NOISE = [
  /api\.openpanel\.dev/,
  /favicon/,
  /sentry/i,
  /\[vite\]/,
  /Failed to load resource/,
  // The sidebar's AI composer input (not this surface) differs in a `style` attribute.
  /A tree hydrated but some attributes/,
  /requires a `DialogTitle`/,
  /unique "key" prop/,
  // Asserted on its own in 'first visit hydrates without a mismatch'.
  /Hydration failed/,
];

function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') {
      return;
    }
    const text = message.text();
    if (!NOISE.some((pattern) => pattern.test(text))) {
      problems.push(`console: ${text.slice(0, 300)}`);
    }
  });
  page.on('pageerror', (error) => {
    if (!NOISE.some((pattern) => pattern.test(error.message))) {
      problems.push(`pageerror: ${error.message.slice(0, 300)}`);
    }
  });
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() >= 400 && !NOISE.some((p) => p.test(url))) {
      problems.push(`http ${response.status()}: ${url.slice(0, 200)}`);
    }
  });
  return problems;
}

async function open(page: Page, path: string) {
  await page.context().addCookies([
    {
      name: 'feedback-prompt-seen',
      value: new Date().toISOString(),
      url: process.env.DASHBOARD_URL ?? 'http://localhost:3000',
    },
  ]);
  // The project switcher only gets its label once the client has hydrated.
  const hydrated = page.getByRole('combobox').first();
  for (const attempt of [1, 2, 3]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    try {
      await expect(hydrated).toContainText('Acme', { timeout: 45_000 });
      return;
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
    }
  }
}

const rows = (page: Page) => page.locator('[data-index]');

test.describe('events list', () => {
  test('renders rows without page errors', async ({ page }) => {
    const problems = watch(page);
    await open(page, `${SHOP}/events`);
    await expect(page).toHaveURL(/\/events\/events/);
    await expect(rows(page).first()).toBeVisible();
    expect(await rows(page).count()).toBeGreaterThan(10);
    await page.screenshot({ path: `${SHOTS}/events-list.png` });
    expect(problems).toEqual([]);
  });

  test('first visit hydrates without a mismatch', async ({ page }) => {
    const hydrationErrors: string[] = [];
    page.on('pageerror', (error) => {
      if (error.message.includes('Hydration failed')) {
        hydrationErrors.push(error.message.slice(0, 200));
      }
    });
    await open(page, `${SHOP}/events`);
    await expect(rows(page).first()).toBeVisible();
    expect(hydrationErrors).toEqual([]);
  });

  test('scrolling to the bottom loads the next page', async ({ page }) => {
    await open(page, `${SHOP}/events`);
    await expect(rows(page).first()).toBeVisible();
    const nextPage = page.waitForResponse(
      (response) =>
        response.url().includes('event.events') &&
        response.url().includes('cursor') &&
        response.status() === 200
    );
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await nextPage;
    await expect
      .poll(() =>
        rows(page).evaluateAll((elements) =>
          Math.max(
            ...elements.map((el) => Number(el.getAttribute('data-index')))
          )
        )
      )
      .toBeGreaterThan(49);
  });

  test('event-name filter narrows the list and survives reload', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page, `${SHOP}/events`);
    await page.getByRole('button', { name: 'Filters' }).click();
    await page.screenshot({ path: `${SHOTS}/events-filters-sheet.png` });
    await page
      .getByRole('combobox')
      .filter({ hasText: 'Select event' })
      .click();
    await page
      .getByPlaceholder(/search/i)
      .last()
      .fill('purchase');
    await page
      .getByRole('option', { name: /purchase/ })
      .first()
      .click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/events=purchase/);
    await page.waitForLoadState('networkidle');
    await expect(rows(page).first().locator('button[title]')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/events-filtered.png` });
    const names = await rows(page).locator('button[title]').allInnerTexts();
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names)).toEqual(new Set(['purchase']));

    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(rows(page).first().locator('button[title]')).toBeVisible();
    const afterReload = await rows(page)
      .locator('button[title]')
      .allInnerTexts();
    expect(new Set(afterReload)).toEqual(new Set(['purchase']));
    expect(problems).toEqual([]);
  });

  test('details drawer shows properties and links to the profile', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page, `${SHOP}/events/events?events=purchase`);
    await rows(page).first().locator('button[title="purchase"]').click();
    const drawer = page.getByRole('complementary', { name: 'Event details' });
    await expect(page).toHaveURL(/[?&]event=/);
    await expect(drawer.getByText('Properties')).toBeVisible();
    await expect(drawer.getByText('Information')).toBeVisible();
    await expect(drawer.getByText('All events for purchase')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/event-details.png` });

    await drawer.getByRole('button', { name: 'Raw' }).click();
    await expect(drawer.getByText('"sessionId"')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/event-details-raw.png` });
    await drawer.getByRole('button', { name: 'Pretty' }).click();

    await drawer.locator('a[href*="/profiles/"]').click();
    await expect(page).toHaveURL(/\/profiles\/[^/]+/);
    await expect(
      page.getByRole('complementary', { name: 'Event details' })
    ).toHaveCount(0);
    await expect(page.getByText('Profile Information')).toBeVisible();
    await page.waitForLoadState('networkidle');
    // The drawer lives in the URL, so back lands on the list with it open again.
    await page.goBack();
    await expect(page).toHaveURL(/[?&]events=purchase/);
    await expect(page).toHaveURL(/[?&]event=/);
    await expect(drawer).toHaveCount(1);
    expect(problems).toEqual([]);
  });

  test('clicking a property in the details drawer filters by it', async ({
    page,
  }) => {
    await open(page, `${SHOP}/events/events?events=purchase`);
    await rows(page).first().locator('button[title]').click();
    const drawer = page.getByRole('complementary', { name: 'Event details' });
    await expect(drawer.getByText('Properties')).toBeVisible();
    await drawer.getByText('Payment', { exact: true }).click();
    // The list filters beside the drawer; the drawer stays open.
    await expect(page).toHaveURL(/f=properties\.payment/);
    await expect(drawer).toHaveCount(1);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/events-filter-by-property.png` });
    await expect(rows(page).first()).toBeVisible();
  });

  test('"Show all" in the details drawer filters by the event name', async ({
    page,
  }) => {
    await open(page, `${SHOP}/events`);
    await rows(page).first().locator('button[title]').click();
    const drawer = page.getByRole('complementary', { name: 'Event details' });
    await drawer.getByRole('button', { name: 'Show all' }).click();
    await expect(page).toHaveURL(/[?&]events=/);
    await expect(drawer).toHaveCount(1);
  });

  test('the Session ID column can be switched on and links to the session', async ({
    page,
  }) => {
    await open(page, `${SHOP}/events`);
    await page.getByRole('combobox', { name: 'Toggle columns' }).click();
    await page.screenshot({ path: `${SHOTS}/events-view-options.png` });
    await page.getByRole('option', { name: 'Session ID' }).click();
    await page.keyboard.press('Escape');
    await expect(
      page.getByText('Session ID', { exact: true }).first()
    ).toBeVisible();
    const link = rows(page).first().locator('a[href*="/sessions/"]');
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/sessions\/[^/]+/);
    await expect(page.getByText('Session not found')).toHaveCount(0);
  });

  test('date range limits the list', async ({ page }) => {
    await open(page, `${SHOP}/events`);
    await page.getByRole('button', { name: 'Date range' }).click();
    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('button', { name: /September 29/ })
      .first()
      .click();
    await dialog
      .getByRole('button', { name: /September 30/ })
      .first()
      .click();
    await page.screenshot({ path: `${SHOTS}/events-date-range.png` });
    await dialog.getByRole('button', { name: /^Select 29 sep/ }).click();
    await expect(page).toHaveURL(/startDate=2026-09-2\d.*endDate=/);
    await expect(
      page.getByRole('button', { name: 'Sep 29 - Sep 30' })
    ).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/events-date-range-applied.png` });
    // Newest first: the last selected day (30 Sep) must be part of the range.
    await expect(rows(page).first().locator('button[title]')).toBeVisible();
    await expect(rows(page).first()).toContainText(/30 sep/i);
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Sep 29 - Sep 30' })
    ).toBeVisible();
  });

  test('editing an event toggles its conversion flag, icon and color', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page, `${SHOP}/events/events?events=add_to_cart`);
    const firstRow = rows(page).first();
    await expect(firstRow.locator('button[title="add to cart"]')).toBeVisible();
    await firstRow.locator('button').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Edit: add_to_cart')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/event-edit.png` });
    const conversion = dialog.getByRole('checkbox');
    await expect(conversion).not.toBeChecked();
    await conversion.click();
    await dialog.getByPlaceholder('Search for an icon').fill('cart');
    await dialog.locator('.grid button').first().click();
    await expect(dialog.getByText('Pick a color')).toBeVisible();
    await dialog.locator('.grid button').nth(3).click();
    await page.screenshot({ path: `${SHOTS}/event-edit-color.png` });
    await dialog.getByRole('button', { name: 'Update event' }).click();
    await expect(page.getByText('Event updated')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Conversions' }).click();
    await expect(rows(page).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/event-edit-conversions.png` });
    await expect(
      rows(page).locator('button[title="add to cart"]').first()
    ).toBeVisible();

    // Restore: the seed does not mark add_to_cart as a conversion.
    await open(page, `${SHOP}/events/events?events=add_to_cart`);
    await expect(
      rows(page).first().locator('button[title="add to cart"]')
    ).toBeVisible();
    await rows(page).first().locator('button').first().click();
    await expect(dialog.getByText('Edit: add_to_cart')).toBeVisible();
    await expect(dialog.getByRole('checkbox')).toBeChecked();
    await dialog.getByRole('checkbox').click();
    await dialog.getByRole('button', { name: 'Update event' }).click();
    await expect(page.getByText('Event updated').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Conversions' }).click();
    await expect(rows(page).first()).toBeVisible();
    await expect(rows(page).locator('button[title="add to cart"]')).toHaveCount(
      0
    );
    expect(problems).toEqual([]);
  });

  test('the live indicator counts new events and refreshes on click', async ({
    page,
    seed,
    request,
  }) => {
    const shop = seed.projects.find((project) => project.id === 'acme-shop');
    if (!shop) {
      throw new Error('acme-shop is not seeded');
    }
    await open(page, `${SHOP}/events`);
    await expect(page.getByRole('button', { name: 'Listening' })).toBeVisible();
    const marker = `/e2e-data-${Date.now()}`;
    const response = await request.post(
      'https://api.main.local.openpanel.cc/track',
      {
        headers: {
          'openpanel-client-id': shop.clientId,
          'openpanel-client-secret': shop.clientSecret,
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36',
          'x-client-ip': '81.2.69.142',
        },
        data: {
          type: 'track',
          payload: { name: 'screen_view', properties: { __path: marker } },
        },
      }
    );
    expect(response.status()).toBeLessThan(300);
    const indicator = page.getByRole('button', { name: /new events/ });
    await expect(indicator).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: `${SHOTS}/events-live.png` });
    await indicator.click();
    await expect(page.getByRole('button', { name: 'Listening' })).toBeVisible();
    await expect(rows(page).locator(`button[title="${marker}"]`)).toBeVisible();
  });

  test('conversions tab lists only conversion events', async ({ page }) => {
    const problems = watch(page);
    await open(page, `${SHOP}/events`);
    await page.getByRole('tab', { name: 'Conversions' }).click();
    await expect(page).toHaveURL(/\/events\/conversions/);
    await expect(rows(page).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/events-conversions.png` });
    const names = new Set(
      await rows(page).locator('button[title]').allInnerTexts()
    );
    for (const name of names) {
      expect(['purchase', 'account created']).toContain(name);
    }
    expect(problems).toEqual([]);
  });

  test('stats tab renders its four charts', async ({ page }) => {
    await open(page, `${SHOP}/events/stats`);
    for (const title of [
      'Events over time',
      'Share of events',
      'Events by name',
      'Trend by event',
    ]) {
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('screen_view').first()).toBeVisible();
    // The toolbar carries its own range, interval and event pickers.
    await expect(
      page.getByRole('button', { name: 'Day', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('combobox').filter({ hasText: 'All events' })
    ).toBeVisible();
    await page.screenshot({
      path: `${SHOTS}/events-stats.png`,
      fullPage: true,
    });
  });

  test('stats tab follows the range, interval and event pickers', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(
      page,
      `${SHOP}/events/stats?range=today&overrideInterval=hour&events=add_to_cart,search`
    );
    await expect(
      page.getByRole('button', { name: 'Today', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Hour', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('combobox').filter({ hasText: 'add_to_cart' })
    ).toBeVisible();
    for (const event of ['add_to_cart', 'search']) {
      await expect(
        page.getByRole('button', { name: event, exact: true })
      ).toBeVisible();
    }
    // Every widget (time series and aggregates alike) shows exactly the
    // picked events (two, so the time series render a legend), and both
    // time series are bucketed by hour.
    const card = (title: string) =>
      page
        .locator('div.card')
        .filter({ has: page.locator('.title', { hasText: title }) });
    for (const title of [
      'Events over time',
      'Share of events',
      'Events by name',
      'Trend by event',
    ]) {
      for (const event of ['add_to_cart', 'search']) {
        await expect(card(title).getByText(event).first()).toBeVisible();
      }
      await expect(card(title).getByText('screen_view')).toHaveCount(0);
    }
    for (const title of ['Events over time', 'Trend by event']) {
      await expect(card(title).getByText('00:00').first()).toBeVisible();
    }
    await page.screenshot({
      path: `${SHOTS}/events-stats-filtered.png`,
      fullPage: true,
    });
    expect(problems).toEqual([]);
  });

  test('mobile viewport has no horizontal page scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, `${SHOP}/events`);
    await expect(rows(page).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/events-mobile.png` });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('pressing back right after opening a profile returns to the events list', async ({
    page,
  }) => {
    await open(page, `${SHOP}/events/events?events=purchase`);
    await rows(page).first().locator('a[href*="/profiles/"]').click();
    await expect(page).toHaveURL(/\/profiles\/[^/]+/);
    await page.goBack();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/events\?events=purchase/);
  });
});

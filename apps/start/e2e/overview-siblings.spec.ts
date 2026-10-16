import { expect as baseExpect, test } from './fixtures';
import {
  attachProblems,
  dismissFeedbackPrompt,
  expectNoRealProblems,
  gotoOverview,
  metricCard,
  PROJECT_IDS,
  SLOW_TEST_TIMEOUT_MS,
  shot,
  trpcQuery,
  watchPage,
} from './overview-helpers';

// The shared dev stack answers slowly while other suites run against it.
const expect = baseExpect.configure({ timeout: 30_000 });
test.use({ actionTimeout: 20_000 });

const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.beforeEach(() => {
  test.setTimeout(SLOW_TEST_TIMEOUT_MS);
});

for (const projectId of PROJECT_IDS) {
  test(`${projectId}: realtime, pages and insights render without errors`, async ({
    page,
  }, testInfo) => {
    const problems = watchPage(page);
    await page.setViewportSize({ width: 1440, height: 1000 });

    await page.goto(`/acme/${projectId}/realtime`);
    for (const title of [
      'Unique visitors last 30 min',
      'Geo',
      'Referrals',
      'Paths',
    ]) {
      await expect(
        page.getByText(title, { exact: true }).locator('visible=true').first()
      ).toBeVisible();
    }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await shot(page, `siblings-${projectId}-realtime`);
    await expect(page.locator('body')).not.toContainText(
      /NaN|undefined|Something went wrong/
    );

    await page.goto(`/acme/${projectId}/pages`);
    await expect(
      page.getByRole('heading', { name: 'Pages', level: 1 })
    ).toBeVisible();
    const pages = await trpcQuery<Array<{ path: string; origin: string }>>(
      page,
      'overview.topPages',
      { projectId, range: '30d', filters: [], mode: 'page' }
    );
    await expect(
      page.getByText(String(pages[0]?.path), { exact: true }).first()
    ).toBeVisible();
    await page.waitForLoadState('networkidle');
    await shot(page, `siblings-${projectId}-pages`);
    await expect(page.locator('body')).not.toContainText(
      /NaN|undefined|Something went wrong/
    );

    await page.goto(`/acme/${projectId}/insights`);
    await expect(
      page.getByRole('heading', { name: 'Insights', level: 1 })
    ).toBeVisible();
    await expect(page.getByPlaceholder('Search insights...')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await shot(page, `siblings-${projectId}-insights`);
    await expect(page.locator('body')).not.toContainText(
      /NaN|undefined|Something went wrong/
    );

    await attachProblems(testInfo, problems);
    expect(expectNoRealProblems(problems)).toEqual({
      pageErrors: [],
      responses: [],
    });
  });
}

test('pages: search, empty state and row click without Search Console', async ({
  page,
}, testInfo) => {
  const problems = watchPage(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/acme/acme-shop/pages');
  await expect(
    page.getByRole('heading', { name: 'Pages', level: 1 })
  ).toBeVisible();
  await expect(page.getByText('/cart', { exact: true }).first()).toBeVisible();
  await page.waitForLoadState('networkidle');

  const search = page.getByPlaceholder('Search pages');
  await search.fill('checkout');
  await expect(
    page.getByText('/checkout', { exact: true }).first()
  ).toBeVisible();
  await expect(page.getByText('/cart', { exact: true })).toHaveCount(0);
  await search.fill('zzz-no-such-page');
  await expect(page.getByText('No pages').first()).toBeVisible();
  await shot(page, 'siblings-pages-empty', false);
  await search.fill('');
  await expect(page.getByText('/cart', { exact: true }).first()).toBeVisible();

  // The details panel only opens for projects with Search Console connected,
  // which the seeded projects are not: a row click must stay a no-op.
  await page.getByText('/cart', { exact: true }).first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await attachProblems(testInfo, problems);
  expect(expectNoRealProblems(problems)).toEqual({
    pageErrors: [],
    responses: [],
  });
});

test('insights: filters keep their state in the URL and the empty state is shown', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/acme/acme-shop/insights');
  await expect(
    page.getByRole('heading', { name: 'Insights', level: 1 })
  ).toBeVisible();
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder('Search insights...').fill('google');
  await expect(page).toHaveURL(/search=google/);
  for (const [trigger, option] of [
    ['All Windows', '7 Days'],
    ['All Severity', 'Severe'],
    ['All Directions', 'Increasing'],
  ] as const) {
    await page
      .getByRole('combobox')
      .filter({ hasText: new RegExp(trigger, 'i') })
      .click();
    await page.getByRole('option', { name: option, exact: true }).click();
  }
  await shot(page, 'siblings-insights-filtered', false);
  const url = page.url();
  await page.reload();
  await expect(page.getByPlaceholder('Search insights...')).toHaveValue(
    'google'
  );
  expect(new URL(page.url()).search).toBe(new URL(url).search);
});

test.describe('390px mobile viewport', () => {
  test.use({ viewport: MOBILE_VIEWPORT, hasTouch: true, isMobile: true });

  test('overview fits the viewport and its controls work', async ({
    page,
  }, testInfo) => {
    const problems = watchPage(page);
    await gotoOverview(page, 'acme-shop', '?range=7d');
    await dismissFeedbackPrompt(page);
    await shot(page, 'mobile-overview-top', false);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
    for (const title of [
      'Unique Visitors',
      'Sessions',
      'Pageviews',
      'Pages per session',
      'Bounce Rate',
      'Session Duration',
      'Revenue',
    ]) {
      const box = await metricCard(page, title).boundingBox();
      expect(box, title).not.toBeNull();
      expect(
        (box?.x ?? 0) + (box?.width ?? 0),
        `${title} right edge`
      ).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
    }

    await metricCard(page, 'Sessions').click();
    await expect(page).toHaveURL(/metric=1/);

    await page
      .getByRole('button', { name: 'Last 7 days', exact: true })
      .click();
    await page.getByRole('menuitem', { name: /^Last 30 days/ }).click();
    await expect(page).toHaveURL(/range=30d/);
    await shot(page, 'mobile-overview-30d', false);

    // Below `md` the Filters button is icon-only and has no accessible name.
    await page
      .locator('button:has(svg.lucide-funnel, svg.lucide-filter)')
      .first()
      .click();
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
    await shot(page, 'mobile-overview-filters', false);
    await page
      .getByRole('dialog', { name: 'Filters' })
      .getByRole('button', { name: 'Close' })
      .click();

    await page
      .getByRole('button', { name: 'Google', exact: true })
      .first()
      .click();
    await expect(
      page.getByRole('button', { name: 'Remove filter' })
    ).toHaveCount(1);
    await shot(page, 'mobile-overview-filtered');

    const overflowAfter = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflowAfter, 'horizontal overflow in px').toBeLessThanOrEqual(0);

    await attachProblems(testInfo, problems);
    expect(expectNoRealProblems(problems)).toEqual({
      pageErrors: [],
      responses: [],
    });
  });

  test('realtime and pages fit the viewport', async ({ page }) => {
    for (const path of ['realtime', 'pages']) {
      await page.goto(`/acme/acme-shop/${path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      await shot(page, `mobile-${path}`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(
        overflow,
        `${path}: horizontal overflow in px`
      ).toBeLessThanOrEqual(0);
    }
  });
});

import { expect as baseExpect, test } from './fixtures';
import {
  attachProblems,
  compactNumber,
  dismissFeedbackPrompt,
  expectNoRealProblems,
  fetchStats,
  filter,
  gotoOverview,
  metricCard,
  overviewReady,
  SLOW_TEST_TIMEOUT_MS,
  shot,
  trpcQuery,
  watchPage,
} from './overview-helpers';

const PROJECT = 'acme-shop';
const METRIC_KEYS = [
  'unique_visitors',
  'total_sessions',
  'total_screen_views',
  'views_per_session',
  'bounce_rate',
  'avg_session_duration',
  'total_revenue',
];

// The shared dev stack answers slowly while other suites run against it.
const expect = baseExpect.configure({ timeout: 30_000 });
test.use({ actionTimeout: 20_000 });

test.beforeEach(async ({ page }) => {
  test.setTimeout(SLOW_TEST_TIMEOUT_MS);
  await page.setViewportSize({ width: 1440, height: 1000 });
});

function pill(page: import('@playwright/test').Page, label: string) {
  return page
    .locator('div.rounded-md.border', {
      has: page.getByRole('button', { name: 'Remove filter' }),
    })
    .filter({ hasText: label });
}

test('widget-row filters combine, survive reload and back/forward, and can be removed', async ({
  page,
}, testInfo) => {
  const problems = watchPage(page);
  await gotoOverview(page, PROJECT, '?range=7d');
  await dismissFeedbackPrompt(page);
  const unfiltered = await fetchStats(page, PROJECT, {});

  await page
    .getByRole('button', { name: 'Google', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/f=referrer_name(,|%2C)is(,|%2C)Google/);
  const google = await fetchStats(page, PROJECT, {
    filters: [filter('referrer_name', ['Google'])],
  });
  await expect(metricCard(page, 'Sessions')).toContainText(
    compactNumber(google.metrics.total_sessions ?? 0)
  );
  await expect(pill(page, 'Google')).toBeVisible();

  await page
    .getByRole('button', { name: 'mobile', exact: true })
    .first()
    .click();
  const both = await fetchStats(page, PROJECT, {
    filters: [
      filter('referrer_name', ['Google']),
      filter('device', ['mobile']),
    ],
  });
  expect(both.metrics.total_sessions).toBeLessThan(
    google.metrics.total_sessions ?? 0
  );
  await expect(metricCard(page, 'Sessions')).toContainText(
    compactNumber(both.metrics.total_sessions ?? 0)
  );
  await expect(pill(page, 'mobile')).toBeVisible();
  await shot(page, 'filters-google-mobile', false);
  const searchWithBoth = new URL(page.url()).searchParams.toString();

  await page.reload();
  await overviewReady(page);
  expect(new URL(page.url()).searchParams.toString()).toBe(searchWithBoth);
  await expect(pill(page, 'Google')).toBeVisible();
  await expect(pill(page, 'mobile')).toBeVisible();
  await expect(metricCard(page, 'Sessions')).toContainText(
    compactNumber(both.metrics.total_sessions ?? 0)
  );

  // Entries pushed before the reload belong to the old document, so back and
  // forward are full page loads here.
  await page.goBack();
  await overviewReady(page);
  await expect(pill(page, 'mobile')).toHaveCount(0);
  await expect(pill(page, 'Google')).toBeVisible();
  await expect(metricCard(page, 'Sessions')).toContainText(
    compactNumber(google.metrics.total_sessions ?? 0)
  );
  await page.goForward();
  await overviewReady(page);
  await expect(pill(page, 'mobile')).toBeVisible();

  // operator: is -> is not
  await pill(page, 'Google')
    .getByRole('button', { name: 'Is', exact: true })
    .click();
  await shot(page, 'filters-operator-menu', false);
  await page
    .getByRole('menuitem')
    .filter({ hasText: /^Is not$/ })
    .click();
  await expect(page).toHaveURL(/referrer_name(,|%2C)isNot/);
  const notGoogleMobile = await fetchStats(page, PROJECT, {
    filters: [
      filter('referrer_name', ['Google'], 'isNot'),
      filter('device', ['mobile']),
    ],
  });
  await expect(metricCard(page, 'Sessions')).toContainText(
    compactNumber(notGoogleMobile.metrics.total_sessions ?? 0)
  );

  await pill(page, 'Google')
    .getByRole('button', { name: 'Remove filter' })
    .click();
  await pill(page, 'mobile')
    .getByRole('button', { name: 'Remove filter' })
    .click();
  await expect(page.getByRole('button', { name: 'Remove filter' })).toHaveCount(
    0
  );
  await expect(metricCard(page, 'Sessions')).toContainText(
    compactNumber(unfiltered.metrics.total_sessions ?? 0)
  );

  await attachProblems(testInfo, problems);
  expect(expectNoRealProblems(problems)).toEqual({
    pageErrors: [],
    responses: [],
  });
});

test('page filter from the filter modal: totals match the API and the series is sane', async ({
  page,
}, testInfo) => {
  const problems = watchPage(page);
  await gotoOverview(page, PROJECT, '?range=7d');
  await dismissFeedbackPrompt(page);
  const unfiltered = await fetchStats(page, PROJECT, {});

  await page.getByRole('button', { name: 'Filters' }).click();
  const dialog = page.getByRole('dialog', { name: 'Filters' });
  await dialog.getByRole('button', { name: 'Add filter' }).click();
  await page
    .getByRole('menu', { name: 'Add filter' })
    .getByText('path', { exact: true })
    .click();
  await expect(page).toHaveURL(/f=path/);
  await shot(page, 'filters-modal-path-empty', false);

  // A filter without a value must not change the numbers.
  await page.waitForLoadState('networkidle');
  // The open sheet hides the page from the accessibility tree, so read the card by its text.
  await expect
    .soft(
      page
        .locator('div.card.grid')
        .first()
        .locator('button', { hasText: 'Unique Visitors' }),
      'a path filter without a value must not change the totals'
    )
    .toContainText(compactNumber(unfiltered.metrics.unique_visitors ?? 0), {
      timeout: 10_000,
    });

  await dialog.getByRole('button', { name: /Select/ }).click();
  await shot(page, 'filters-modal-path-values', false);
  await page.getByRole('option', { name: '/cart', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/f=path(,|%2C)is(,|%2C)(%2F|%252F|\/)cart/);
  await shot(page, 'filters-modal-path-cart', false);
  await dialog.getByRole('button', { name: 'Close' }).click();

  const cart = await fetchStats(page, PROJECT, {
    filters: [filter('path', ['/cart'])],
  });
  await expect(metricCard(page, 'Sessions')).toContainText(
    compactNumber(cart.metrics.total_sessions ?? 0)
  );
  await expect(metricCard(page, 'Pageviews')).toContainText(
    compactNumber(cart.metrics.total_screen_views ?? 0)
  );
  for (const title of [
    'Unique Visitors',
    'Sessions',
    'Pageviews',
    'Pages per session',
    'Bounce Rate',
    'Session Duration',
    'Revenue',
  ]) {
    await expect(metricCard(page, title)).not.toContainText(
      /NaN|undefined|null|N\/A/
    );
  }
  await shot(page, 'filters-path-cart', false);

  // API sanity for the page-filter query path
  for (const [range, interval, buckets] of [
    ['7d', 'day', 8],
    ['today', 'hour', 24],
    ['yesterday', 'hour', 24],
    ['30d', 'day', 31],
  ] as const) {
    const stats = await fetchStats(page, PROJECT, {
      range,
      interval,
      filters: [filter('path', ['/cart'])],
    });
    expect(stats.series, `${range} buckets`).toHaveLength(buckets);
    const sum = (key: string) =>
      stats.series.reduce((total, row) => total + Number(row[key] ?? 0), 0);
    expect(sum('total_sessions'), `${range} sessions`).toBe(
      stats.metrics.total_sessions
    );
    expect(sum('total_screen_views'), `${range} pageviews`).toBe(
      stats.metrics.total_screen_views
    );
    expect(sum('unique_visitors')).toBeGreaterThanOrEqual(
      stats.metrics.unique_visitors ?? 0
    );
    for (const value of Object.values(stats.metrics)) {
      expect(Number.isNaN(value)).toBe(false);
    }
    const rowsWithNull = stats.series.filter((row) =>
      METRIC_KEYS.some((key) => row[key] === null || row[key] === undefined)
    );
    expect
      .soft(
        rowsWithNull.map((row) => row.date),
        `${range}: buckets with a null metric`
      )
      .toEqual([]);
  }

  // /cart is viewed for a while in every session, so time on it cannot be zero.
  expect
    .soft(
      cart.metrics.avg_session_duration,
      'session duration under a page filter'
    )
    .toBeGreaterThan(0);

  const topPages = await trpcQuery<Array<{ path: string; sessions: number }>>(
    page,
    'overview.topPages',
    { projectId: PROJECT, range: '7d', filters: [], mode: 'page' }
  );
  expect(topPages.find((row) => row.path === '/cart')?.sessions).toBe(
    cart.metrics.total_sessions
  );

  await attachProblems(testInfo, problems);
  expect(expectNoRealProblems(problems)).toEqual({
    pageErrors: [],
    responses: [],
  });
});

test('a revenue filter in the URL is ignored by the overview instead of breaking the widgets', async ({
  page,
}) => {
  const filters = [filter('revenue', ['0'], 'gt')];
  const stats = await fetchStats(page, PROJECT, { filters });
  expect(stats.metrics.total_sessions).toBeGreaterThan(0);
  // trpcQuery throws on a non-2xx answer.
  await trpcQuery(page, 'overview.topGeneric', {
    projectId: PROJECT,
    range: '7d',
    filters,
    column: 'device',
  });
  await trpcQuery(page, 'overview.topPages', {
    projectId: PROJECT,
    range: '7d',
    filters,
    mode: 'page',
  });
});

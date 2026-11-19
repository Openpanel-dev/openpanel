import type { Locator, Page } from '@playwright/test';
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
  PROJECT_IDS,
  SLOW_TEST_TIMEOUT_MS,
  shot,
  trpcQuery,
  watchPage,
} from './overview-helpers';

// The shared dev stack answers slowly while other suites run against it.
const expect = baseExpect.configure({ timeout: 30_000 });
test.use({ actionTimeout: 20_000 });

const SHOP = 'acme-shop';
const WIDGET_ROW_LIMIT = 15;

interface GenericRow {
  name: string | null;
  prefix?: string;
  sessions: number;
  pageviews: number;
  revenue?: number;
}
interface PageRow {
  origin: string;
  path: string;
  sessions: number;
  pageviews: number;
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(SLOW_TEST_TIMEOUT_MS);
  await page.setViewportSize({ width: 1440, height: 1000 });
});

function widget(page: Page, searchPlaceholder: RegExp): Locator {
  return page
    .locator('div.card')
    .filter({ has: page.getByPlaceholder(searchPlaceholder) })
    .last();
}

function topGeneric(page: Page, projectId: string, column: string) {
  return trpcQuery<GenericRow[]>(page, 'overview.topGeneric', {
    projectId,
    range: '7d',
    filters: [],
    column,
  });
}

async function scrollThroughOverview(page: Page) {
  for (let step = 0; step < 8; step++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(400);
  }
  await page.waitForLoadState('networkidle');
}

const GENERIC_TABS = [
  {
    search: /^Search (refs|urls|types|source|medium|campaign|term|content)$/,
    tabs: [
      ['Refs', 'referrer_name'],
      ['Urls', 'referrer'],
      ['Types', 'referrer_type'],
      ['Source', 'utm_source'],
      ['Medium', 'utm_medium'],
      ['Campaign', 'utm_campaign'],
      ['Term', 'utm_term'],
      ['Content', 'utm_content'],
    ],
  },
  {
    search:
      /^Search (devices|browser|browser version|os|os version|brands|models)$/,
    tabs: [
      ['Devices', 'device'],
      ['Browser', 'browser'],
      ['Browser Version', 'browser_version'],
      ['OS', 'os'],
      ['OS Version', 'os_version'],
      ['Brands', 'brand'],
      ['Models', 'model'],
    ],
  },
  {
    search: /^Search (countries|regions|cities)$/,
    tabs: [
      ['Countries', 'country'],
      ['Regions', 'region'],
      ['Cities', 'city'],
    ],
  },
] as const;

test('sources, devices and geo widgets: every tab lists the API rows and adds up to the session total', async ({
  page,
}, testInfo) => {
  const problems = watchPage(page);
  await gotoOverview(page, SHOP, '?range=7d');
  await dismissFeedbackPrompt(page);
  const stats = await fetchStats(page, SHOP, {});

  for (const { search, tabs } of GENERIC_TABS) {
    const card = widget(page, search);
    await card.scrollIntoViewIfNeeded();
    for (const [label, column] of tabs) {
      await card.getByRole('button', { name: label, exact: true }).click();
      const rows = await topGeneric(page, SHOP, column);
      const sessions = rows.reduce((total, row) => total + row.sessions, 0);
      expect(sessions, `${column} sessions add up`).toBe(
        stats.metrics.total_sessions
      );
      const pageviews = rows.reduce((total, row) => total + row.pageviews, 0);
      expect(pageviews, `${column} pageviews add up`).toBe(
        stats.metrics.total_screen_views
      );
      const revenue = rows.reduce(
        (total, row) => total + (row.revenue ?? 0),
        0
      );
      expect(revenue, `${column} revenue adds up`).toBe(
        stats.metrics.total_revenue
      );

      const named = rows.find((row) => row.name);
      // Countries are listed by display name, not by the ISO code the API returns.
      if (named?.name && column !== 'country') {
        await expect(
          // Regions, cities and versions are prefixed with their parent ("US > California").
          card
            .getByRole('button')
            .filter({ hasText: named.name.replace(/https?:\/\/(www\.)?/, '') })
            .first(),
          `${column} first named row`
        ).toBeVisible();
        await expect(card, `${column} sessions of ${named.name}`).toContainText(
          compactNumber(named.sessions)
        );
      }
      await expect(card).not.toContainText(/NaN|undefined|\bnull\b/);
      expect(
        await card.getByRole('button').filter({ hasText: /./ }).count()
      ).toBeGreaterThan(0);
    }
    await shot(page, `widgets-${tabs[0][1]}-last-tab`, false);
    await card.getByRole('button', { name: tabs[0][0], exact: true }).click();
  }

  await attachProblems(testInfo, problems);
  expect(expectNoRealProblems(problems)).toEqual({
    pageErrors: [],
    responses: [],
  });
});

test('clicking a UTM source row filters the overview to that source', async ({
  page,
}) => {
  await gotoOverview(page, SHOP, '?range=7d&sources=utm_source');
  await dismissFeedbackPrompt(page);
  const rows = await topGeneric(page, SHOP, 'utm_source');
  const source = rows.find((row) => row.name);
  expect(source?.name).toBeTruthy();
  const card = widget(page, /^Search source$/);
  await card
    .getByRole('button', { name: String(source?.name), exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Remove filter' })).toHaveCount(
    1
  );
  await page.waitForLoadState('networkidle');
  await shot(page, 'widgets-utm-filter', false);
  await expect(metricCard(page, 'Sessions')).toContainText(
    compactNumber(Number(source?.sessions))
  );
});

test('pages widget: tabs, search, sorting, domain toggle and the details modal', async ({
  page,
}, testInfo) => {
  const problems = watchPage(page);
  await gotoOverview(page, SHOP, '?range=7d');
  await dismissFeedbackPrompt(page);
  const card = widget(page, /^Search (pages|entries|exits)$/);
  const pages = await trpcQuery<PageRow[]>(page, 'overview.topPages', {
    projectId: SHOP,
    range: '7d',
    filters: [],
    mode: 'page',
  });
  const top = pages[0];
  await expect(
    card.getByRole('button', { name: String(top?.path), exact: true })
  ).toBeVisible();
  expect(pages.length).toBeGreaterThan(WIDGET_ROW_LIMIT);

  // search
  await card.getByPlaceholder('Search pages').fill('checkout');
  await expect(
    card.getByRole('button', { name: '/checkout', exact: true })
  ).toBeVisible();
  await expect(
    card.getByRole('button', { name: '/cart', exact: true })
  ).toHaveCount(0);
  await card.getByPlaceholder('Search pages').fill('zzz-no-such-page');
  await shot(page, 'widgets-pages-search-empty', false);
  await card.getByPlaceholder('Search pages').fill('');

  // sort ascending by views: desc -> asc
  await card.getByRole('button', { name: 'Views' }).click();
  await card.getByRole('button', { name: 'Views' }).click();
  const leastViewed = [...pages].sort((a, b) => a.pageviews - b.pageviews)[0];
  await shot(page, 'widgets-pages-sorted-asc', false);
  await expect(card).toContainText(String(leastViewed?.path));
  await card.getByRole('button', { name: 'Views' }).click();

  // domain toggle
  await card.getByRole('button', { name: 'Show domain' }).click();
  await expect(page).toHaveURL(/d=true/);
  await expect(card).toContainText('shop.acme.test');
  await card.getByRole('button', { name: 'Hide domain' }).click();

  // entries / exits
  for (const [label, mode, column] of [
    ['Entries', 'entry', 'Entries'],
    ['Exits', 'exit', 'Exits'],
  ] as const) {
    await card.getByRole('button', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`pages=${mode}`));
    const rows = await trpcQuery<PageRow[]>(page, 'overview.topPages', {
      projectId: SHOP,
      range: '7d',
      filters: [],
      mode,
    });
    await expect(card).toContainText(column);
    await expect(
      card.getByRole('button', { name: String(rows[0]?.path), exact: true })
    ).toBeVisible();
    await expect(card).not.toContainText(/NaN|undefined/);
    await shot(page, `widgets-pages-${mode}`, false);
  }

  // The details button on the Exits tab should list exit pages.
  const exits = await trpcQuery<PageRow[]>(page, 'overview.topPages', {
    projectId: SHOP,
    range: '7d',
    filters: [],
    mode: 'exit',
  });
  await card.locator('button').filter({ hasNotText: /./ }).first().click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('heading')).toBeVisible();
  await shot(page, 'widgets-pages-modal-from-exits', false);
  await expect
    .soft(modal.getByRole('heading'), 'details modal opened from the Exits tab')
    .toHaveText(/Exit/);
  const firstRow = modal.locator('div.group\\/row').first();
  await expect
    .soft(firstRow, 'first modal row is the top exit page')
    .toContainText(compactNumber(Number(exits[0]?.sessions)));

  // search + virtualised list inside the modal
  await modal.getByPlaceholder('Search pages...').fill('/product/');
  await expect(
    modal.getByRole('button', { name: '/cart', exact: true })
  ).toHaveCount(0);
  await expect(modal.locator('div.group\\/row').first()).toContainText(
    '/product/'
  );
  await modal.getByPlaceholder('Search pages...').fill('zzz-no-such-page');
  await expect(modal).toContainText('No results found');
  await modal.getByPlaceholder('Search pages...').fill('');
  await modal.locator('div.overflow-y-auto').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    modal.getByRole('button', { name: String(pages.at(-1)?.path), exact: true })
  ).toBeVisible();

  // clicking a row filters by page
  await modal.locator('div.overflow-y-auto').evaluate((element) => {
    element.scrollTop = 0;
  });
  await modal.getByRole('button', { name: '/cart', exact: true }).click();
  await expect(page).toHaveURL(/f=path(,|%2C)is(,|%2C)(%2F|%252F|\/)cart/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Remove filter' })).toHaveCount(
    2
  );

  await attachProblems(testInfo, problems);
  expect(expectNoRealProblems(problems)).toEqual({
    pageErrors: [],
    responses: [],
  });
});

test('generic details modal: search, rows from the API, click to filter; chart view toggle', async ({
  page,
}, testInfo) => {
  const problems = watchPage(page);
  await gotoOverview(page, SHOP, '?range=7d&geo=city');
  await dismissFeedbackPrompt(page);
  const cities = await topGeneric(page, SHOP, 'city');
  expect(cities.length).toBeGreaterThan(WIDGET_ROW_LIMIT);

  const geo = widget(page, /^Search cities$/);
  await geo.scrollIntoViewIfNeeded();
  await geo.locator('button').filter({ hasNotText: /./ }).first().click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByRole('heading')).toHaveText('Top Cities');
  await expect(modal.locator('div.group\\/row').first()).toContainText(
    String(cities[0]?.name)
  );
  await shot(page, 'widgets-city-modal', false);
  await modal.locator('div.overflow-y-auto').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(modal.locator('div.group\\/row').last()).toContainText(
    cities.at(-1)?.name || 'Not set'
  );
  const searchTerm = String(
    cities.find((row, index) => index >= 3 && row.name)?.name
  );
  await modal.getByRole('searchbox').fill(searchTerm.toLowerCase());
  await expect(modal.locator('div.group\\/row')).toHaveCount(
    cities.filter(
      (row) =>
        row.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        row.prefix?.toLowerCase().includes(searchTerm.toLowerCase())
    ).length
  );
  await modal.locator('div.group\\/row').first().getByRole('button').click();
  await expect(page).toHaveURL(/f=city/);
  await page.keyboard.press('Escape');
  const filtered = await fetchStats(page, SHOP, {
    filters: [filter('city', [searchTerm])],
  });
  await expect(metricCard(page, 'Sessions')).toContainText(
    compactNumber(Number(filtered.metrics.total_sessions))
  );
  await page.getByRole('button', { name: 'Remove filter' }).click();

  // chart view
  const sources = widget(page, /^Search refs$/);
  await sources.scrollIntoViewIfNeeded();
  await sources.getByRole('button', { name: 'Switch to chart view' }).click();
  await expect(page).toHaveURL(/view=chart/);
  await expect(
    sources.locator('svg.recharts-surface, svg').first()
  ).toBeVisible();
  await page.waitForLoadState('networkidle');
  await shot(page, 'widgets-chart-view', false);
  await expect(sources).not.toContainText(/NaN|undefined/);
  await sources.getByRole('button', { name: 'Switch to table view' }).click();
  await expect(
    sources.getByRole('button', { name: 'Google', exact: true })
  ).toBeVisible();

  await attachProblems(testInfo, problems);
  expect(expectNoRealProblems(problems)).toEqual({
    pageErrors: [],
    responses: [],
  });
});

test('events widget tabs, geo map, weekly trends and user journey render', async ({
  page,
}, testInfo) => {
  const problems = watchPage(page);
  await gotoOverview(page, SHOP, '?range=7d');
  await dismissFeedbackPrompt(page);
  const events = await trpcQuery<Array<{ name: string; count: number }>>(
    page,
    'overview.topEvents',
    {
      projectId: SHOP,
      range: '7d',
      filters: [],
      excludeEvents: ['session_start', 'session_end', 'screen_view'],
    }
  );
  const card = widget(page, /^Search (events|conversions|link out)$/);
  await card.scrollIntoViewIfNeeded();
  await expect(
    card.getByRole('button', { name: String(events[0]?.name), exact: true })
  ).toBeVisible();
  await expect(card).toContainText(compactNumber(Number(events[0]?.count)));

  await card.getByRole('button', { name: 'Conversions', exact: true }).click();
  await expect(
    card.getByRole('button', { name: 'purchase', exact: true })
  ).toBeVisible();
  await shot(page, 'widgets-conversions', false);
  await card.getByRole('button', { name: 'Link out', exact: true }).click();
  await page.waitForLoadState('networkidle');
  await shot(page, 'widgets-link-out', false);
  await expect(card).not.toContainText(/NaN|undefined/);
  await card.getByRole('button', { name: 'Events', exact: true }).click();

  await page.getByText('Map', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.locator('figure svg path').first()).toBeAttached();
  await scrollThroughOverview(page);

  for (const tab of [
    'Sessions',
    'Pageviews',
    'Bounce Rate',
    'Pages / Session',
    'Session Duration',
    'Unique Visitors',
  ]) {
    await page.getByRole('button', { name: tab, exact: true }).last().click();
  }
  await expect(page.getByText('User Journey')).toBeVisible();
  for (const steps of ['3 Steps', '5 Steps']) {
    await page.getByRole('button', { name: steps, exact: true }).click();
    await page.waitForLoadState('networkidle');
    await expect(
      page.locator('svg').filter({ hasText: '/category/' }).first()
    ).toBeVisible();
  }
  await shot(page, 'widgets-journey', false);

  await attachProblems(testInfo, problems);
  expect(expectNoRealProblems(problems)).toEqual({
    pageErrors: [],
    responses: [],
  });
});

for (const projectId of PROJECT_IDS) {
  test(`${projectId}: every widget renders without errors and breakdowns add up`, async ({
    page,
  }, testInfo) => {
    const problems = watchPage(page);
    await gotoOverview(page, projectId, '?range=7d');
    await dismissFeedbackPrompt(page);
    const stats = await fetchStats(page, projectId, {});

    for (const column of [
      'referrer_name',
      'referrer_type',
      'utm_source',
      'country',
      'city',
      'device',
      'browser',
      'os',
      'brand',
      'model',
    ]) {
      const rows = await topGeneric(page, projectId, column);
      expect(
        rows.reduce((total, row) => total + row.sessions, 0),
        `${column} sessions`
      ).toBe(stats.metrics.total_sessions);
      expect(
        rows.reduce((total, row) => total + (row.revenue ?? 0), 0),
        `${column} revenue`
      ).toBe(stats.metrics.total_revenue);
    }
    for (const mode of ['entry', 'exit']) {
      const rows = await trpcQuery<PageRow[]>(page, 'overview.topPages', {
        projectId,
        range: '7d',
        filters: [],
        mode,
      });
      expect(
        rows.reduce((total, row) => total + row.sessions, 0),
        `${mode} pages sessions`
      ).toBe(stats.metrics.total_sessions);
    }
    const pages = await trpcQuery<PageRow[]>(page, 'overview.topPages', {
      projectId,
      range: '7d',
      filters: [],
      mode: 'page',
    });
    expect(pages.reduce((total, row) => total + row.pageviews, 0)).toBe(
      stats.metrics.total_screen_views
    );

    const hasRevenue = Number(stats.metrics.total_revenue) > 0;
    const sources = widget(page, /^Search refs$/);
    await expect(sources.getByRole('button', { name: 'Revenue' })).toHaveCount(
      hasRevenue ? 1 : 0
    );

    await scrollThroughOverview(page);
    await page.waitForTimeout(1500);
    await shot(page, `widgets-${projectId}-bottom`, false);
    await expect(page.locator('main, body').first()).not.toContainText(
      /NaN|undefined|Something went wrong/
    );

    await attachProblems(testInfo, problems);
    expect(expectNoRealProblems(problems)).toEqual({
      pageErrors: [],
      responses: [],
    });
  });
}

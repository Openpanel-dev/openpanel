import type { Browser, Page } from '@playwright/test';
import { expect as baseExpect, test } from './fixtures';
import {
  API_URL,
  compactNumber,
  dismissFeedbackPrompt,
  fetchStats,
  gotoOverview,
  metricCard,
  overviewReady,
  type PageProblems,
  SLOW_TEST_TIMEOUT_MS,
  shot,
  trpcMutation,
  trpcQuery,
  watchPage,
} from './overview-helpers';

// The shared dev stack answers slowly while other suites run against it.
const expect = baseExpect.configure({ timeout: 30_000 });
test.use({ actionTimeout: 20_000 });

const PROJECT = 'acme-web';
const ORGANIZATION = 'acme';
const SHARE_PASSWORD = 'e2e-overview-secret';
const DIRECT_LOAD_TIMEOUT_MS = 60_000;

interface ShareSettings {
  id: string;
  public: boolean;
  hasPassword?: boolean;
}

function shareSettings(page: Page) {
  return trpcQuery<ShareSettings | null>(page, 'share.overviewSettings', {
    projectId: PROJECT,
  });
}

function makePrivate(page: Page) {
  return trpcMutation(page, 'share.createOverview', {
    organizationId: ORGANIZATION,
    projectId: PROJECT,
    public: false,
    password: null,
  });
}

async function anonymousPage(browser: Browser) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: { cookies: [], origins: [] },
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  return { context, page, problems: watchPage(page) };
}

/**
 * Opens a share the way an in-app link does: a client-side route change from
 * an already loaded page. Opening the URL directly is covered by its own test.
 */
async function openShareClientSide(page: Page, path: string) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.evaluate((target) => {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

function realResponses(problems: PageProblems) {
  return problems.badResponses.filter((r) => !r.includes('api.openpanel.dev'));
}

async function shareOverviewThroughModal(page: Page, password?: string) {
  await page.getByRole('button', { name: 'Private', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Make public' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByText('Overview public availability')).toBeVisible();
  if (password) {
    await modal
      .getByPlaceholder('Enter your password (optional)')
      .fill(password);
  }
  return modal;
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(SLOW_TEST_TIMEOUT_MS * 2);
  await page.setViewportSize({ width: 1440, height: 1000 });
});

test.afterEach(async ({ page }) => {
  await makePrivate(page);
});

test('public share: create from the modal, open logged out, then make private', async ({
  page,
  browser,
}) => {
  await makePrivate(page);
  await gotoOverview(page, PROJECT, '?range=7d');
  await dismissFeedbackPrompt(page);

  const modal = await shareOverviewThroughModal(page);
  await shot(page, 'share-modal', false);
  await modal.getByRole('button', { name: 'Make it public' }).click();
  await expect(page.getByText('Your overview is now public')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Public', exact: true })
  ).toBeVisible();
  const settings = await shareSettings(page);
  expect(settings?.public).toBe(true);
  expect(settings?.hasPassword).toBeFalsy();

  // the menu now offers View and Make private
  await page.getByRole('button', { name: 'Public', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'View' })).toHaveAttribute(
    'href',
    `/share/overview/${settings?.id}`
  );
  await expect(
    page.getByRole('menuitem', { name: 'Make private' })
  ).toBeVisible();
  await page.keyboard.press('Escape');

  const stats = await fetchStats(page, PROJECT, {});
  const visitor = await anonymousPage(browser);
  try {
    await openShareClientSide(
      visitor.page,
      `/share/overview/${settings?.id}?range=7d`
    );
    await overviewReady(visitor.page);
    await expect(metricCard(visitor.page, 'Sessions')).toContainText(
      compactNumber(Number(stats.metrics.total_sessions))
    );
    // No dashboard chrome for an anonymous viewer.
    await expect(
      visitor.page.getByRole('link', { name: 'Settings' })
    ).toHaveCount(0);
    await shot(visitor.page, 'share-public-anonymous');

    // range switch works for a visitor
    await visitor.page
      .getByRole('button', { name: 'Last 7 days', exact: true })
      .click();
    await visitor.page.getByRole('menuitem', { name: /^Last 30 days/ }).click();
    const month = await fetchStats(page, PROJECT, { range: '30d' });
    await expect(metricCard(visitor.page, 'Sessions')).toContainText(
      compactNumber(Number(month.metrics.total_sessions))
    );

    // widget row click filters
    await visitor.page
      .getByRole('button', { name: 'Google', exact: true })
      .first()
      .click();
    await expect(visitor.page).toHaveURL(/f=referrer_name/);
    await expect(
      visitor.page.getByRole('button', { name: 'Remove filter' })
    ).toHaveCount(1);
    await visitor.page.waitForLoadState('networkidle');
    await shot(visitor.page, 'share-public-filtered', false);

    expect
      .soft(
        realResponses(visitor.problems),
        'failed requests on the public share'
      )
      .toEqual([]);
    // The client-side hop from /login can race that page's own hydration.
    expect
      .soft(
        visitor.problems.pageErrors.filter(
          (e) => !e.includes('Hydration failed')
        )
      )
      .toEqual([]);

    // details modal
    const sources = visitor.page
      .locator('div.card')
      .filter({ has: visitor.page.getByPlaceholder('Search refs') })
      .last();
    await sources.locator('button').filter({ hasNotText: /./ }).first().click();
    await visitor.page.waitForLoadState('networkidle');
    await visitor.page.waitForTimeout(3000);
    await shot(visitor.page, 'share-public-details-modal', false);
    expect
      .soft(
        visitor.page.url(),
        'the details button keeps the visitor on the share'
      )
      .toContain('/share/overview/');
    await expect
      .soft(
        visitor.page.getByRole('dialog').locator('div.group\\/row').first(),
        'details modal lists rows for a visitor'
      )
      .toBeVisible({ timeout: 5000 });
    expect
      .soft(
        realResponses(visitor.problems),
        'failed requests after opening the details modal'
      )
      .toEqual([]);

    // make private from the menu
    await page.getByRole('button', { name: 'Public', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Make private' }).click();
    await expect(
      page.getByRole('button', { name: 'Private', exact: true })
    ).toBeVisible();
    expect((await shareSettings(page))?.public).toBe(false);

    await visitor.page.goto(`/share/overview/${settings?.id}`, {
      timeout: DIRECT_LOAD_TIMEOUT_MS,
    });
    await expect(visitor.page.getByText('Share not found')).toBeVisible();
    await shot(visitor.page, 'share-private-anonymous', false);
    const denied = await visitor.page.request.get(
      `${API_URL}/trpc/overview.stats?input=${encodeURIComponent(
        JSON.stringify({
          json: {
            projectId: PROJECT,
            shareId: settings?.id,
            range: '7d',
            interval: 'day',
            filters: [],
          },
        })
      )}`
    );
    expect(denied.status()).toBeGreaterThanOrEqual(400);
  } finally {
    await visitor.context.close();
  }
});

test('password-protected share: locked without the password, opens with it', async ({
  page,
  browser,
}) => {
  await makePrivate(page);
  await gotoOverview(page, PROJECT, '?range=7d');
  await dismissFeedbackPrompt(page);

  const modal = await shareOverviewThroughModal(page, SHARE_PASSWORD);
  // keyboard submit
  await modal.getByPlaceholder('Enter your password (optional)').press('Enter');
  await expect(
    page.getByRole('button', { name: 'Public', exact: true })
  ).toBeVisible();
  const settings = await shareSettings(page);
  expect(settings?.public).toBe(true);
  expect(settings?.hasPassword).toBe(true);
  const stats = await fetchStats(page, PROJECT, {});

  const visitor = await anonymousPage(browser);
  try {
    // The data endpoints stay closed until the password is given.
    const locked = await visitor.page.request.get(
      `${API_URL}/trpc/overview.stats?input=${encodeURIComponent(
        JSON.stringify({
          json: {
            projectId: PROJECT,
            shareId: settings?.id,
            range: '7d',
            interval: 'day',
            filters: [],
          },
        })
      )}`
    );
    expect(locked.status()).toBeGreaterThanOrEqual(400);

    await openShareClientSide(
      visitor.page,
      `/share/overview/${settings?.id}?range=7d`
    );
    await expect(visitor.page.getByText(/is locked/)).toBeVisible();
    await expect(visitor.page.getByText('Unique Visitors')).toHaveCount(0);
    await shot(visitor.page, 'share-locked', false);

    await visitor.page.waitForLoadState('networkidle');
    await visitor.page
      .getByPlaceholder('Enter your password')
      .fill('wrong-password');
    await visitor.page.getByRole('button', { name: 'Get access' }).click();
    await expect(visitor.page.getByText('Incorrect password')).toBeVisible();
    await expect(visitor.page.getByText(/is locked/)).toBeVisible();

    const unlock = visitor.page.waitForResponse((response) =>
      response.url().includes('auth.signInShare')
    );
    await visitor.page
      .getByPlaceholder('Enter your password')
      .fill(SHARE_PASSWORD);
    await visitor.page.getByPlaceholder('Enter your password').press('Enter');
    expect((await unlock).status()).toBe(200);

    // The cookie from the unlock opens the data endpoints.
    const unlocked = await visitor.page.request.get(
      `${API_URL}/trpc/overview.stats?input=${encodeURIComponent(
        JSON.stringify({
          json: {
            projectId: PROJECT,
            shareId: settings?.id,
            range: '7d',
            interval: 'day',
            filters: [],
          },
        })
      )}`
    );
    expect(unlocked.status()).toBe(200);

    await openShareClientSide(
      visitor.page,
      `/share/overview/${settings?.id}?range=7d`
    );
    await overviewReady(visitor.page);
    await expect(visitor.page.getByText(/is locked/)).toHaveCount(0);
    await expect(metricCard(visitor.page, 'Sessions')).toContainText(
      compactNumber(Number(stats.metrics.total_sessions))
    );
    await shot(visitor.page, 'share-unlocked', false);
  } finally {
    await visitor.context.close();
  }
});

test('a public share link opens when loaded directly', async ({
  page,
  browser,
}) => {
  await page.goto('/login');
  await trpcMutation(page, 'share.createOverview', {
    organizationId: ORGANIZATION,
    projectId: PROJECT,
    public: true,
    password: null,
  });
  const settings = await shareSettings(page);
  const visitor = await anonymousPage(browser);
  try {
    await visitor.page.goto(`/share/overview/${settings?.id}?range=7d`, {
      timeout: DIRECT_LOAD_TIMEOUT_MS,
    });
    await overviewReady(visitor.page);
    await expect(visitor.page).toHaveTitle(/Acme Web/);
    await shot(visitor.page, 'share-direct-load', false);
  } finally {
    await visitor.context.close();
  }
});

import type { Browser } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  createDashboard,
  createReport,
  deleteDashboard,
  eventSeries,
  hideFeedbackPrompt,
  reportInput,
  shot,
  trackProblems,
  trpcMutation,
  trpcQuery,
} from './reports-helpers';

const SHOP = 'acme-shop';
const DASHBOARD_URL = 'https://main.local.openpanel.cc';
const PASSWORD = 'e2e-share-secret';

interface ShareSettings {
  id: string;
  public: boolean;
  hasPassword: boolean;
}

async function anonymousPage(browser: Browser) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    baseURL: DASHBOARD_URL,
  });
  context.setDefaultNavigationTimeout(45_000);
  return { context, page: await context.newPage() };
}

test.use({ actionTimeout: 15_000, navigationTimeout: 45_000 });

test.beforeEach(async ({ page }) => {
  await hideFeedbackPrompt(page);
});

test('share a dashboard publicly, with a password, then make it private', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  await page.goto(`/acme/${SHOP}/dashboards`);
  const dashboard = await createDashboard(page, SHOP, 'share');
  try {
    await createReport(
      page,
      dashboard.id,
      'E2E reports shared purchases',
      reportInput(SHOP, { series: eventSeries(['purchase']) })
    );
    await page.goto(`/acme/${SHOP}/dashboards/${dashboard.id}`);
    await page.waitForLoadState('networkidle');
    const openShareModal = async () => {
      await expect(async () => {
        if (
          !(await page
            .getByRole('menuitem', { name: 'Share dashboard' })
            .isVisible())
        ) {
          await page
            .locator('button:has(svg.lucide-ellipsis)')
            .first()
            .click({ timeout: 3000 });
        }
        await page
          .getByRole('menuitem', { name: 'Share dashboard' })
          .click({ timeout: 3000 });
        await expect(
          page.getByText('Dashboard public availability')
        ).toBeVisible({ timeout: 3000 });
      }).toPass({ timeout: 45_000 });
    };
    const settings = () =>
      trpcQuery<ShareSettings | null>(page, 'share.dashboardSettings', {
        projectId: SHOP,
        dashboardId: dashboard.id,
      });

    await openShareModal();
    await shot(page, 'share-01-modal');
    await page.getByRole('button', { name: 'Make it public' }).click();
    await expect
      .poll(async () => (await settings())?.public, { timeout: 20_000 })
      .toBe(true);
    const share = (await settings()) as ShareSettings;
    expect(share.public).toBe(true);
    expect(share.hasPassword).toBe(false);

    const anonymous = await anonymousPage(browser);
    const anonymousProblems = trackProblems(anonymous.page);
    await anonymous.page.goto(`/share/dashboard/${share.id}`);
    await expect(
      anonymous.page.getByText('E2E reports shared purchases')
    ).toBeVisible({ timeout: 45_000 });
    await anonymous.page.waitForTimeout(3000);
    await shot(anonymous.page, 'share-02-public-dashboard');
    expect(anonymousProblems.responses).toEqual([]);

    await openShareModal();
    await expect(page.getByText('Currently shared')).toBeVisible();
    await page
      .getByPlaceholder('Enter your password (optional)')
      .fill(PASSWORD);
    await page.getByRole('button', { name: 'Update' }).click();
    await expect
      .poll(async () => (await settings())?.hasPassword, { timeout: 20_000 })
      .toBe(true);
    await page.waitForTimeout(1500);

    const locked = await anonymousPage(browser);
    await locked.page.goto(`/share/dashboard/${share.id}`);
    await expect(locked.page.locator('input[type="password"]')).toBeVisible({
      timeout: 45_000,
    });
    await expect(
      locked.page.getByText('E2E reports shared purchases')
    ).toHaveCount(0);
    await shot(locked.page, 'share-03-password-gate');
    await locked.page.locator('input[type="password"]').fill('wrong-password');
    await locked.page.keyboard.press('Enter');
    await locked.page.waitForTimeout(2000);
    await expect(
      locked.page.getByText('E2E reports shared purchases')
    ).toHaveCount(0);
    await locked.page.locator('input[type="password"]').fill(PASSWORD);
    await locked.page.keyboard.press('Enter');
    await expect(
      locked.page.getByText('E2E reports shared purchases')
    ).toBeVisible({ timeout: 45_000 });
    await locked.context.close();

    // Reopening the modal and pressing Update without retyping must keep the password.
    await openShareModal();
    await page.waitForTimeout(1000);
    await shot(page, 'share-04-modal-with-password');
    await page.getByRole('button', { name: 'Update' }).click();
    await page.waitForTimeout(4000);
    expect
      .soft(
        ((await settings()) as ShareSettings).hasPassword,
        'Update without retyping keeps the password'
      )
      .toBe(true);

    await trpcMutation(page, 'share.createDashboard', {
      organizationId: 'acme',
      projectId: SHOP,
      dashboardId: dashboard.id,
      public: false,
      password: null,
    });
    expect(((await settings()) as ShareSettings).public).toBe(false);
    await anonymous.page.goto(`/share/dashboard/${share.id}`);
    await expect(anonymous.page.getByText('Share not found')).toBeVisible({
      timeout: 45_000,
    });
    await shot(anonymous.page, 'share-05-disabled');
    await anonymous.context.close();
  } finally {
    await deleteDashboard(page, dashboard.id);
  }
});

test('share reports of several chart types and open them logged out', async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  await page.goto(`/acme/${SHOP}/dashboards`);
  const dashboard = await createDashboard(page, SHOP, 'share-report');
  try {
    const linear = await createReport(
      page,
      dashboard.id,
      'E2E reports shared linear',
      reportInput(SHOP, { series: eventSeries(['purchase']) })
    );
    const sankey = await createReport(
      page,
      dashboard.id,
      'E2E reports shared sankey',
      reportInput(SHOP, {
        chartType: 'sankey',
        series: eventSeries(['product_viewed']),
        options: { type: 'sankey', mode: 'after', steps: 5, exclude: [] },
      })
    );

    await page.goto(`/acme/${SHOP}/reports/${linear.id}`);
    await page.waitForLoadState('networkidle');
    await expect(async () => {
      await page
        .getByRole('button', { name: 'Share', exact: true })
        .click({ timeout: 3000 });
      await expect(
        page.getByRole('button', { name: 'Make it public' })
      ).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 45_000 });
    await shot(page, 'share-10-report-modal');
    await page.getByRole('button', { name: 'Make it public' }).click();
    await expect
      .poll(
        async () =>
          (
            await trpcQuery<ShareSettings | null>(
              page,
              'share.reportSettings',
              { projectId: SHOP, reportId: linear.id }
            )
          )?.public,
        { timeout: 20_000 }
      )
      .toBe(true);
    const linearShare = await trpcQuery<ShareSettings>(
      page,
      'share.reportSettings',
      { projectId: SHOP, reportId: linear.id }
    );
    const sankeyShare = await trpcMutation<ShareSettings>(
      page,
      'share.createReport',
      {
        organizationId: 'acme',
        projectId: SHOP,
        reportId: sankey.id,
        public: true,
        password: null,
      }
    );

    const anonymous = await anonymousPage(browser);
    const problems = trackProblems(anonymous.page);
    await anonymous.page.goto(`/share/report/${linearShare.id}`);
    await expect(
      anonymous.page.getByText('E2E reports shared linear')
    ).toBeVisible({ timeout: 45_000 });
    await expect(
      anonymous.page.locator('svg.recharts-surface').first()
    ).toBeVisible({ timeout: 45_000 });
    await shot(anonymous.page, 'share-11-public-report');
    expect(problems.responses).toEqual([]);

    await anonymous.page.goto(`/share/report/${sankeyShare.id}`);
    await expect(
      anonymous.page.getByText('E2E reports shared sankey')
    ).toBeVisible({ timeout: 45_000 });
    await anonymous.page.waitForTimeout(5000);
    await shot(anonymous.page, 'share-12-public-sankey');
    expect
      .soft(
        problems.responses,
        'a shared sankey report loads for a logged-out viewer'
      )
      .toEqual([]);

    await trpcMutation(page, 'share.createReport', {
      organizationId: 'acme',
      projectId: SHOP,
      reportId: linear.id,
      public: false,
      password: null,
    });
    await anonymous.page.goto(`/share/report/${linearShare.id}`);
    await expect(anonymous.page.getByText('Share not found')).toBeVisible({
      timeout: 45_000,
    });
    await anonymous.context.close();
  } finally {
    await deleteDashboard(page, dashboard.id);
  }
});

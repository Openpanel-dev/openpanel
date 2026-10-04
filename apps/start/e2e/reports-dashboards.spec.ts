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
  trpcQuery,
  uniqueName,
} from './reports-helpers';

const PROJECT = 'acme-app';
const LIST_URL = `/acme/${PROJECT}/dashboards`;

test.beforeEach(async ({ page }) => {
  await hideFeedbackPrompt(page);
});

test('create, rename and delete a dashboard from the list', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems = trackProblems(page);
  const name = uniqueName('crud');
  await page.goto(LIST_URL);
  await page.waitForLoadState('networkidle');
  await shot(page, 'dash-01-list');

  await expect(async () => {
    await page
      .getByRole('button', { name: /Create dashboard|^Dashboard$/ })
      .first()
      .click({ timeout: 3000 });
    await expect(page.getByText('Add dashboard')).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 45_000 });
  await expect(
    page.getByRole('button', { name: 'Create', exact: true })
  ).toBeDisabled();
  await page.getByPlaceholder('Name of the dashboard').fill(name);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/dashboards\/[^/]+$/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { name })).toBeVisible();
  await expect(page.getByText('No reports')).toBeVisible();
  await shot(page, 'dash-02-empty-dashboard');
  const dashboardId = page.url().split('/').pop() as string;

  await page.goto(LIST_URL);
  const card = page.locator('.card', { hasText: name });
  await expect(card).toBeVisible();
  await expect(async () => {
    await card.locator('button[aria-haspopup="menu"]').click({ timeout: 3000 });
    await page.getByRole('menuitem', { name: 'Edit' }).click({ timeout: 3000 });
  }).toPass({ timeout: 45_000 });
  const renamed = `${name} renamed`;
  await page.getByRole('textbox').last().fill(renamed);
  await page.keyboard.press('Enter');
  await expect(page.locator('.card', { hasText: renamed })).toBeVisible();

  await page
    .locator('.card', { hasText: renamed })
    .locator('button[aria-haspopup="menu"]')
    .click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await shot(page, 'dash-03-confirm-delete');
  await page
    .getByRole('button', { name: /^(Yes|Confirm|Delete|Continue|OK)/i })
    .last()
    .click();
  await expect(page.locator('.card', { hasText: renamed })).toHaveCount(0);
  const remaining = await trpcQuery<{ id: string }[]>(page, 'dashboard.list', {
    projectId: PROJECT,
  });
  expect(remaining.map((item) => item.id)).not.toContain(dashboardId);
  expect(problems.pageErrors).toEqual([]);
  expect(problems.responses).toEqual([]);
});

test('dashboard page: search, range, duplicate, move, delete, reload', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const problems = trackProblems(page);
  await page.goto(LIST_URL);
  const source = await createDashboard(page, PROJECT, 'source');
  const target = await createDashboard(page, PROJECT, 'target');
  try {
    await createReport(
      page,
      source.id,
      'E2E reports opens',
      reportInput(PROJECT, { series: eventSeries(['app_opened']) })
    );
    await createReport(
      page,
      source.id,
      'E2E reports signups metric',
      reportInput(PROJECT, {
        chartType: 'metric',
        metric: 'sum',
        series: eventSeries(['signup_completed']),
      })
    );

    await page.goto(`${LIST_URL}/${source.id}`);
    await page.waitForLoadState('networkidle');
    const cards = page.locator('.react-grid-item, .card.flex.h-full');
    await expect(page.getByText('E2E reports opens')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('E2E reports signups metric')).toBeVisible();
    await page.waitForTimeout(3000);
    await shot(page, 'dash-10-two-reports');

    const search = page.getByPlaceholder('Search reports...');
    await search.fill('zzz-nothing');
    await expect(page.getByText('No matching reports')).toBeVisible();
    await search.fill('metric');
    await expect(page.getByText('E2E reports opens')).toHaveCount(0);
    await expect(page.getByText('E2E reports signups metric')).toBeVisible();
    await search.fill('');

    await page
      .getByRole('button', { name: /Last 7 days|Last 30 days|Today/ })
      .first()
      .click();
    await page.getByRole('menuitem', { name: 'Last 30 days' }).click();
    await expect(page).toHaveURL(/range=30d/);
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Last 30 days' })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('E2E reports opens')).toBeVisible({
      timeout: 30_000,
    });

    const opensCard = page
      .locator('.card', { hasText: 'E2E reports opens' })
      .last();
    const menuTrigger = (text: string) =>
      page
        .locator('.card', { hasText: text })
        .last()
        .locator('button[aria-haspopup="menu"]');
    await expect(async () => {
      await menuTrigger('E2E reports opens').click({ timeout: 3000 });
      await expect(
        page.getByRole('menuitem', { name: 'Duplicate' })
      ).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    await expect(page.getByText('Report duplicated')).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await trpcQuery<unknown[]>(page, 'report.list', {
              dashboardId: source.id,
              projectId: PROJECT,
            })
          ).length
      )
      .toBe(3);
    await page.waitForTimeout(1500);
    await shot(page, 'dash-11-duplicated');

    await menuTrigger('E2E reports signups metric').click();
    await page.getByRole('menuitem', { name: 'Move to dashboard' }).click();
    await expect(page.getByText('Move report')).toBeVisible();
    await shot(page, 'dash-12-move-modal');
    await expect(
      page.getByRole('button', { name: 'Move', exact: true })
    ).toBeDisabled();
    await page.getByRole('button', { name: target.name }).click();
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    await expect(page.getByText('Report moved')).toBeVisible();
    await expect(page.getByText('E2E reports signups metric')).toHaveCount(0);
    const moved = await trpcQuery<{ name: string }[]>(page, 'report.list', {
      dashboardId: target.id,
      projectId: PROJECT,
    });
    expect(moved.map((report) => report.name)).toEqual([
      'E2E reports signups metric',
    ]);

    await menuTrigger('E2E reports opens').click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByText('Report deleted')).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await trpcQuery<unknown[]>(page, 'report.list', {
              dashboardId: source.id,
              projectId: PROJECT,
            })
          ).length
      )
      .toBe(1);
    await expect(opensCard).toBeVisible();
    await expect(cards.first()).toBeVisible();
    expect(problems.pageErrors).toEqual([]);
    expect(problems.responses).toEqual([]);
  } finally {
    await deleteDashboard(page, source.id).catch(() => undefined);
    await deleteDashboard(page, target.id).catch(() => undefined);
  }
});

test('a dashboard id that does not exist shows a not-found state', async ({
  page,
}) => {
  await page.goto(`${LIST_URL}/does-not-exist-e2e`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await shot(page, 'dash-20-missing');
  await expect(page.locator('body')).toContainText(
    /not found|does not exist|404/i
  );
});

test('dashboards list fits a 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(LIST_URL);
  const dashboard = await createDashboard(page, PROJECT, 'mobile');
  try {
    await page.goto(`${LIST_URL}/${dashboard.id}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await shot(page, 'dash-30-mobile');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  } finally {
    await deleteDashboard(page, dashboard.id);
  }
});

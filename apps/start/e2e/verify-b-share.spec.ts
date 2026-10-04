import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  eventSeries,
  hideFeedbackPrompt,
  reportInput,
  trpcMutation,
  trpcQuery,
} from './reports-helpers';
import {
  anonymousPage,
  openShareClientSide,
  shot,
  trpcUrl,
} from './verify-b-helpers';

const SHOP = 'acme-shop';
const ORGANIZATION = 'acme';
const PASSWORD = 'e2e-verify-b-secret';
const SIGN_IN_SHARE_WINDOW_MS = 35_000;
const PASSWORD_PLACEHOLDER = 'Enter your password (optional)';

interface ShareSettings {
  id: string;
  public: boolean;
  hasPassword: boolean;
}

interface PublicShare {
  id: string;
  requiresPassword: boolean;
}

const RETENTION_SERIES = ['A', 'B'].map((id) => ({
  id,
  type: 'event',
  name: 'session_start',
  segment: 'event',
  filters: [
    { id: 'n', name: 'name', operator: 'is', value: ['session_start'] },
  ],
}));

const REPORTS: Record<string, Record<string, unknown>> = {
  linear: { series: eventSeries(['purchase']) },
  area: { series: eventSeries(['purchase']) },
  histogram: { series: eventSeries(['purchase']) },
  bar: {
    series: eventSeries(['purchase']),
    breakdowns: [{ id: 'b', name: 'device' }],
  },
  pie: {
    series: eventSeries(['purchase']),
    breakdowns: [{ id: 'b', name: 'device' }],
  },
  metric: { series: eventSeries(['purchase']) },
  map: {
    series: eventSeries(['purchase']),
    breakdowns: [{ id: 'b', name: 'country' }],
  },
  funnel: {
    series: eventSeries(['product_viewed', 'add_to_cart', 'purchase']),
  },
  conversion: { series: eventSeries(['product_viewed', 'purchase']) },
  retention: {
    series: RETENTION_SERIES,
    options: { type: 'retention', criteria: 'on_or_after' },
  },
  sankey: {
    series: eventSeries(['product_viewed']),
    options: { type: 'sankey', mode: 'after', steps: 5, exclude: [] },
  },
};

const reportName = (chartType: string) => `E2E verify-b ${chartType}`;

async function createDashboardWith(page: Page, chartTypes: string[]) {
  const dashboard = await trpcMutation<{ id: string }>(
    page,
    'dashboard.create',
    {
      name: `E2E verify-b share ${Date.now()}`,
      projectId: SHOP,
    }
  );
  const reportIds: Record<string, string> = {};
  for (const chartType of chartTypes) {
    const { projectId: _projectId, ...report } = reportInput(SHOP, {
      chartType,
      ...REPORTS[chartType],
    });
    const created = await trpcMutation<{ id: string }>(page, 'report.create', {
      dashboardId: dashboard.id,
      report: { ...report, name: reportName(chartType) },
    });
    reportIds[chartType] = created.id;
  }
  return { id: dashboard.id, reportIds };
}

function deleteDashboard(page: Page, id: string) {
  return trpcMutation(page, 'dashboard.delete', { id, forceDelete: true });
}

function shareDashboard(
  page: Page,
  dashboardId: string,
  share: { public: boolean; password: string | null }
) {
  return trpcMutation<ShareSettings>(page, 'share.createDashboard', {
    organizationId: ORGANIZATION,
    projectId: SHOP,
    dashboardId,
    ...share,
  });
}

function shareReport(
  page: Page,
  reportId: string,
  share: { public: boolean; password: string | null }
) {
  return trpcMutation<ShareSettings>(page, 'share.createReport', {
    organizationId: ORGANIZATION,
    projectId: SHOP,
    reportId,
    ...share,
  });
}

const dashboardSettings = (page: Page, dashboardId: string) =>
  trpcQuery<ShareSettings | null>(page, 'share.dashboardSettings', {
    projectId: SHOP,
    dashboardId,
  });

const reportSettings = (page: Page, reportId: string) =>
  trpcQuery<ShareSettings | null>(page, 'share.reportSettings', {
    projectId: SHOP,
    reportId,
  });

async function openDashboardShareModal(page: Page) {
  await expect(async () => {
    const item = page.getByRole('menuitem', { name: 'Share dashboard' });
    if (!(await item.isVisible())) {
      await page
        .locator('button:has(svg.lucide-ellipsis)')
        .first()
        .click({ timeout: 3000 });
    }
    await item.click({ timeout: 3000 });
    await expect(page.getByText('Dashboard public availability')).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 45_000 });
}

async function openReportShareModal(page: Page) {
  await expect(async () => {
    await page
      .getByRole('button', { name: 'Share', exact: true })
      .click({ timeout: 3000 });
    await expect(page.getByPlaceholder(PASSWORD_PLACEHOLDER)).toBeVisible({
      timeout: 3000,
    });
  }).toPass({ timeout: 45_000 });
}

/** Every chart card on a shared dashboard loads lazily, once scrolled to. */
async function scrollThroughCards(page: Page, chartTypes: string[]) {
  for (const chartType of chartTypes) {
    await page
      .getByText(reportName(chartType), { exact: true })
      .scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(700);
  }
  await page.waitForLoadState('networkidle');
}

function card(page: Page, chartType: string) {
  return page
    .locator('.react-grid-item')
    .filter({ hasText: reportName(chartType) });
}

test.use({ actionTimeout: 15_000 });

test.beforeEach(async ({ page }) => {
  test.setTimeout(300_000);
  await hideFeedbackPrompt(page);
  await page.goto('/login');
});

test('a shared dashboard renders every chart type for an anonymous visitor', async ({
  page,
  browser,
}) => {
  const chartTypes = Object.keys(REPORTS).filter((type) => type !== 'sankey');
  const dashboard = await createDashboardWith(page, chartTypes);
  const visitor = await anonymousPage(browser);
  try {
    const share = await shareDashboard(page, dashboard.id, {
      public: true,
      password: null,
    });
    await openShareClientSide(visitor.page, `/share/dashboard/${share.id}`);
    await expect(
      visitor.page.getByText(reportName('linear'), { exact: true })
    ).toBeVisible({ timeout: 45_000 });
    await scrollThroughCards(visitor.page, chartTypes);
    await shot(visitor.page, 'item4-shared-dashboard-all-types');

    expect(visitor.page.url()).toContain(`/share/dashboard/${share.id}`);
    expect(visitor.traffic.bad).toEqual([]);
    for (const chartType of chartTypes) {
      const chartCard = card(visitor.page, chartType);
      await expect(chartCard, chartType).not.toContainText(/error loading/i);
      await expect(chartCard, chartType).not.toContainText('Stay calm');
      await expect(chartCard, chartType).not.toContainText('Select 2 events');
    }
    await expect(
      card(visitor.page, 'linear').locator('svg.recharts-surface')
    ).toBeVisible();
    await expect(card(visitor.page, 'funnel')).toContainText('product_viewed');
    await expect(card(visitor.page, 'retention')).toContainText(
      'Weighted Average'
    );
  } finally {
    await visitor.context.close();
    await deleteDashboard(page, dashboard.id);
  }
});

test('range and interval controls on a shared dashboard drive the chart queries', async ({
  page,
  browser,
}) => {
  const dashboard = await createDashboardWith(page, ['linear']);
  const visitor = await anonymousPage(browser);
  try {
    const share = await shareDashboard(page, dashboard.id, {
      public: true,
      password: null,
    });
    const chartRequests: { range: string; interval: string; status: number }[] =
      [];
    visitor.page.on('response', (response) => {
      if (!response.url().includes('/trpc/chart.chart')) {
        return;
      }
      const input = JSON.parse(
        new URL(response.url()).searchParams.get('input') ?? '{}'
      ).json;
      chartRequests.push({
        range: input.range,
        interval: input.interval,
        status: response.status(),
      });
    });
    await openShareClientSide(visitor.page, `/share/dashboard/${share.id}`);
    await expect(
      card(visitor.page, 'linear').locator('svg.recharts-surface')
    ).toBeVisible({ timeout: 45_000 });

    await visitor.page
      .getByRole('button', { name: 'Last 7 days', exact: true })
      .click();
    await visitor.page.getByRole('menuitem', { name: /^Last 30 days/ }).click();
    await expect
      .poll(() =>
        chartRequests.some((r) => r.range === '30d' && r.status === 200)
      )
      .toBe(true);
    await expect(visitor.page).toHaveURL(/range=30d/);

    await visitor.page
      .getByRole('button', { name: 'Day', exact: true })
      .click();
    await visitor.page.getByRole('menuitem', { name: 'Week' }).click();
    await expect
      .poll(() =>
        chartRequests.some(
          (r) => r.range === '30d' && r.interval === 'week' && r.status === 200
        )
      )
      .toBe(true);
    await visitor.page.waitForLoadState('networkidle');
    await shot(visitor.page, 'item4-shared-dashboard-30d-week');
    expect(visitor.traffic.bad).toEqual([]);
  } finally {
    await visitor.context.close();
    await deleteDashboard(page, dashboard.id);
  }
});

test('a shared sankey report loads for an anonymous visitor', async ({
  page,
  browser,
}) => {
  const dashboard = await createDashboardWith(page, ['sankey']);
  const visitor = await anonymousPage(browser);
  try {
    const share = await shareReport(
      page,
      dashboard.reportIds.sankey as string,
      {
        public: true,
        password: null,
      }
    );
    const api = await visitor.page.request.get(
      trpcUrl('chart.sankey', {
        ...reportInput(SHOP, { chartType: 'sankey', ...REPORTS.sankey }),
        shareId: share.id,
        id: dashboard.reportIds.sankey,
      })
    );
    expect
      .soft(api.status(), 'chart.sankey with a shareId and no session')
      .toBe(200);

    await openShareClientSide(visitor.page, `/share/report/${share.id}`);
    await expect(
      visitor.page.getByText(reportName('sankey'), { exact: true })
    ).toBeVisible({ timeout: 45_000 });
    await visitor.page.waitForLoadState('networkidle');
    await visitor.page.waitForTimeout(3000);
    await shot(visitor.page, 'item2-shared-sankey-report');
    expect.soft(visitor.traffic.bad).toEqual([]);
    expect(visitor.page.url(), 'the visitor stays on the share').toContain(
      `/share/report/${share.id}`
    );
  } finally {
    await visitor.context.close();
    await deleteDashboard(page, dashboard.id);
  }
});

test('a sankey card on a shared dashboard loads for an anonymous visitor', async ({
  page,
  browser,
}) => {
  const dashboard = await createDashboardWith(page, ['linear', 'sankey']);
  const visitor = await anonymousPage(browser);
  try {
    const share = await shareDashboard(page, dashboard.id, {
      public: true,
      password: null,
    });
    await openShareClientSide(visitor.page, `/share/dashboard/${share.id}`);
    await expect(
      visitor.page.getByText(reportName('sankey'), { exact: true })
    ).toBeVisible({ timeout: 45_000 });
    await scrollThroughCards(visitor.page, ['sankey']);
    await visitor.page.waitForTimeout(3000);
    await shot(visitor.page, 'item2-shared-dashboard-sankey');
    expect.soft(visitor.traffic.bad).toEqual([]);
    expect(visitor.page.url(), 'the visitor stays on the share').toContain(
      `/share/dashboard/${share.id}`
    );
  } finally {
    await visitor.context.close();
    await deleteDashboard(page, dashboard.id);
  }
});

test('dashboard share modal: Update keeps the existing password', async ({
  page,
  browser,
}) => {
  const dashboard = await createDashboardWith(page, ['linear']);
  const visitor = await anonymousPage(browser);
  try {
    await page.goto(`/acme/${SHOP}/dashboards/${dashboard.id}`);
    await page.waitForLoadState('networkidle');
    await openDashboardShareModal(page);
    await page.getByPlaceholder(PASSWORD_PLACEHOLDER).fill(PASSWORD);
    await page.getByRole('button', { name: 'Make it public' }).click();
    await expect
      .poll(
        async () => (await dashboardSettings(page, dashboard.id))?.hasPassword
      )
      .toBe(true);
    const share = (await dashboardSettings(
      page,
      dashboard.id
    )) as ShareSettings;
    await expect(page.getByText('Dashboard public availability')).toHaveCount(
      0
    );

    await openDashboardShareModal(page);
    await expect(page.getByText('Currently shared')).toBeVisible();
    await page.waitForTimeout(1000);
    await shot(page, 'item3-dashboard-modal-reopened', false);
    const update = page.waitForResponse((response) =>
      response.url().includes('share.createDashboard')
    );
    await page.getByRole('button', { name: 'Update' }).click();
    expect((await update).status()).toBe(200);
    await expect(page.getByText('Dashboard public availability')).toHaveCount(
      0
    );

    const after = (await dashboardSettings(
      page,
      dashboard.id
    )) as ShareSettings;
    expect.soft(after.hasPassword, 'share still has a password').toBe(true);
    const anonymous = await visitor.page.request.get(
      trpcUrl('share.dashboard', { shareId: share.id })
    );
    const body = (await anonymous.json()).result.data.json as PublicShare;
    expect
      .soft(body.requiresPassword, 'anonymous visit asks for it')
      .toBe(true);
    await openShareClientSide(visitor.page, `/share/dashboard/${share.id}`);
    await visitor.page.waitForLoadState('networkidle');
    await shot(visitor.page, 'item3-dashboard-anonymous-after-update', false);
    await expect(visitor.page.getByText('Dashboard is locked')).toBeVisible();
  } finally {
    await visitor.context.close();
    await deleteDashboard(page, dashboard.id);
  }
});

test('report share modal: Update keeps the existing password', async ({
  page,
  browser,
}) => {
  const dashboard = await createDashboardWith(page, ['linear']);
  const reportId = dashboard.reportIds.linear as string;
  const visitor = await anonymousPage(browser);
  try {
    await page.goto(`/acme/${SHOP}/reports/${reportId}`);
    await page.waitForLoadState('networkidle');
    await openReportShareModal(page);
    await page.getByPlaceholder(PASSWORD_PLACEHOLDER).fill(PASSWORD);
    await page.getByRole('button', { name: 'Make it public' }).click();
    await expect
      .poll(async () => (await reportSettings(page, reportId))?.hasPassword)
      .toBe(true);
    const share = (await reportSettings(page, reportId)) as ShareSettings;
    await expect(page.getByPlaceholder(PASSWORD_PLACEHOLDER)).toHaveCount(0);

    await openReportShareModal(page);
    await expect(page.getByText('Currently shared')).toBeVisible();
    await page.waitForTimeout(1000);
    await shot(page, 'item3-report-modal-reopened', false);
    const update = page.waitForResponse((response) =>
      response.url().includes('share.createReport')
    );
    await page.getByRole('button', { name: 'Update' }).click();
    expect((await update).status()).toBe(200);
    await expect(page.getByPlaceholder(PASSWORD_PLACEHOLDER)).toHaveCount(0);

    const after = (await reportSettings(page, reportId)) as ShareSettings;
    expect.soft(after.hasPassword, 'share still has a password').toBe(true);
    await openShareClientSide(visitor.page, `/share/report/${share.id}`);
    await visitor.page.waitForLoadState('networkidle');
    await shot(visitor.page, 'item3-report-anonymous-after-update', false);
    await expect(visitor.page.getByText('Report is locked')).toBeVisible();
  } finally {
    await visitor.context.close();
    await deleteDashboard(page, dashboard.id);
  }
});

for (const kind of ['dashboard', 'report'] as const) {
  test(`shared ${kind}: password gate, then disabling the share`, async ({
    page,
    browser,
  }) => {
    // `auth.signInShare` allows three attempts per 30 s for the whole machine.
    await page.waitForTimeout(SIGN_IN_SHARE_WINDOW_MS);
    const dashboard = await createDashboardWith(page, ['linear']);
    const reportId = dashboard.reportIds.linear as string;
    const setShare = (share: { public: boolean; password: string | null }) =>
      kind === 'dashboard'
        ? shareDashboard(page, dashboard.id, share)
        : shareReport(page, reportId, share);
    const visitor = await anonymousPage(browser);
    try {
      const share = await setShare({ public: true, password: PASSWORD });
      const path = `/share/${kind}/${share.id}`;
      const chartUrl = trpcUrl('chart.chart', {
        ...reportInput(SHOP, REPORTS.linear as Record<string, unknown>),
        shareId: share.id,
        id: reportId,
      });
      expect(
        (await visitor.page.request.get(chartUrl)).status(),
        'chart data is closed before the password'
      ).toBeGreaterThanOrEqual(400);

      await openShareClientSide(visitor.page, path);
      await expect(visitor.page.getByText(/is locked/)).toBeVisible({
        timeout: 45_000,
      });
      await expect(
        visitor.page.getByText(reportName('linear'), { exact: true })
      ).toHaveCount(0);
      await visitor.page.waitForLoadState('networkidle');
      await visitor.page.getByPlaceholder('Enter your password').fill('wrong');
      await visitor.page.getByRole('button', { name: 'Get access' }).click();
      await expect(visitor.page.getByText('Incorrect password')).toBeVisible();
      await expect(visitor.page.getByText(/is locked/)).toBeVisible();
      await shot(visitor.page, `item4-${kind}-wrong-password`, false);

      const unlock = visitor.page.waitForResponse((response) =>
        response.url().includes('auth.signInShare')
      );
      await visitor.page.getByPlaceholder('Enter your password').fill(PASSWORD);
      await visitor.page.getByPlaceholder('Enter your password').press('Enter');
      expect((await unlock).status()).toBe(200);
      expect((await visitor.page.request.get(chartUrl)).status()).toBe(200);

      // The unlock reloads the document; re-enter client-side with the cookie.
      await openShareClientSide(visitor.page, path);
      await expect(
        visitor.page.getByText(reportName('linear'), { exact: true })
      ).toBeVisible({ timeout: 45_000 });
      await expect(
        visitor.page.locator('svg.recharts-surface').first()
      ).toBeVisible({ timeout: 45_000 });
      await shot(visitor.page, `item4-${kind}-unlocked`, false);

      await setShare({ public: false, password: null });
      expect(
        (await visitor.page.request.get(chartUrl)).status(),
        'chart data is closed once the share is disabled'
      ).toBeGreaterThanOrEqual(400);
      await openShareClientSide(visitor.page, path);
      await expect(visitor.page.getByText('Share not found')).toBeVisible({
        timeout: 45_000,
      });
      await shot(visitor.page, `item4-${kind}-disabled`, false);
    } finally {
      await visitor.context.close();
      await deleteDashboard(page, dashboard.id);
    }
  });
}

test('clicking a chart point on a shared report keeps the visitor on the share', async ({
  page,
  browser,
}) => {
  const dashboard = await createDashboardWith(page, ['linear']);
  const visitor = await anonymousPage(browser);
  try {
    const share = await shareReport(
      page,
      dashboard.reportIds.linear as string,
      {
        public: true,
        password: null,
      }
    );
    await openShareClientSide(visitor.page, `/share/report/${share.id}`);
    const surface = visitor.page.locator('svg.recharts-surface').first();
    await expect(surface).toBeVisible({ timeout: 45_000 });
    await visitor.page.waitForLoadState('networkidle');
    const box = await surface.boundingBox();
    if (!box) {
      throw new Error('chart not drawn');
    }
    await visitor.page.mouse.click(
      box.x + box.width * 0.9,
      box.y + box.height * 0.5
    );
    await visitor.page.waitForTimeout(800);
    const items = await visitor.page.getByRole('menuitem').allInnerTexts();
    test.info().annotations.push({
      type: 'menu items offered to an anonymous visitor',
      description: items.join(', ') || '(none)',
    });
    await shot(visitor.page, 'item4-shared-report-point-menu', false);
    if (items.includes('View Users')) {
      await visitor.page.getByRole('menuitem', { name: 'View Users' }).click();
      await visitor.page.waitForLoadState('networkidle');
      await visitor.page.waitForTimeout(2500);
      await shot(visitor.page, 'item4-shared-report-view-users', false);
    }
    expect.soft(visitor.traffic.bad).toEqual([]);
    expect(visitor.page.url(), 'the visitor stays on the share').toContain(
      `/share/report/${share.id}`
    );
  } finally {
    await visitor.context.close();
    await deleteDashboard(page, dashboard.id);
  }
});

// The overview share modal has the same "placeholder means null" submit as the
// dashboard and report modals, but a public overview offers no way back into
// the modal, so its password cannot be dropped by an "Update".
test('overview share: a password set in the modal stays until the share is made private', async ({
  page,
}) => {
  const APP = 'acme-app';
  const settings = () =>
    trpcQuery<ShareSettings | null>(page, 'share.overviewSettings', {
      projectId: APP,
    });
  const makePrivate = () =>
    trpcMutation(page, 'share.createOverview', {
      organizationId: ORGANIZATION,
      projectId: APP,
      public: false,
      password: null,
    });
  expect((await settings())?.public ?? false, 'starts private').toBe(false);
  try {
    await page.goto(`/acme/${APP}?range=7d`);
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Private', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Make public' }).click();
    const modal = page.getByRole('dialog');
    await modal.getByPlaceholder(PASSWORD_PLACEHOLDER).fill(PASSWORD);
    await modal.getByRole('button', { name: 'Make it public' }).click();
    await expect(
      page.getByRole('button', { name: 'Public', exact: true })
    ).toBeVisible();
    expect((await settings())?.hasPassword).toBe(true);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Public', exact: true }).click();
    const items = await page.getByRole('menuitem').allInnerTexts();
    await shot(page, 'item3-overview-public-menu', false);
    expect(items.map((item) => item.trim())).toEqual(['View', 'Make private']);
    await page.keyboard.press('Escape');
    expect((await settings())?.hasPassword).toBe(true);
  } finally {
    await makePrivate();
  }
});

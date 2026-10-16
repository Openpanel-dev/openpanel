import { expect, test } from './fixtures';
import {
  addEvent,
  closeSidebar,
  createDashboard,
  deleteDashboard,
  eventSeries,
  hideFeedbackPrompt,
  openSidebar,
  pickChartType,
  reportInput,
  shot,
  trackProblems,
  trpcQuery,
  uniqueName,
  waitForChart,
} from './reports-helpers';

const SHOP = 'acme-shop';
const CHECKOUT_STEPS = [
  'product_viewed',
  'add_to_cart',
  'checkout_started',
  'shipping_info_added',
  'payment_info_added',
  'purchase',
];

interface ChartSeries {
  names: string[];
  metrics: { sum: number };
}

test.use({ actionTimeout: 20_000 });

test.beforeEach(async ({ page }) => {
  await hideFeedbackPrompt(page);
});

test('linear report: build, compare with the API, save, reload, edit, update', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const problems = trackProblems(page);
  await page.goto(`/acme/${SHOP}/dashboards`);
  const dashboard = await createDashboard(page, SHOP, 'builder');
  try {
    await page.goto(`/acme/${SHOP}/reports?dashboardId=${dashboard.id}`);
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByText('Pick at least one event to start visualising')
    ).toBeVisible({ timeout: 30_000 });
    await addEvent(page, 'purchase');
    await addEvent(page, 'add_to_cart');
    const sheet = await openSidebar(page);
    await sheet.getByRole('button', { name: 'Select breakdown' }).click();
    await page.getByRole('menuitem', { name: 'Event properties' }).click();
    await page.getByPlaceholder('Search').last().fill('device');
    await page
      .locator('[data-radix-popper-content-wrapper]')
      .getByText('device', { exact: true })
      .first()
      .click();
    await closeSidebar(page);
    await waitForChart(page);
    await shot(page, 'builder-01-linear');

    const api = await trpcQuery<{ series: ChartSeries[] }>(
      page,
      'chart.chart',
      reportInput(SHOP, {
        series: eventSeries(['purchase', 'add_to_cart']),
        breakdowns: [{ id: 'b', name: 'device' }],
      })
    );
    const tableText = (
      await page.locator('#report-editor').innerText()
    ).replace(/\s+/g, ' ');
    for (const serie of api.series) {
      // Row cells read: serie, breakdown, unique, sum.
      const row = new RegExp(
        `${serie.names[0].replace(/[()]/g, '\\$&')} ${serie.names[1]} \\d+ ${serie.metrics.sum} `
      );
      expect(
        tableText,
        `${serie.names.join(' / ')} shows sum ${serie.metrics.sum}`
      ).toMatch(row);
    }

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Create report' })
    ).toBeVisible();
    const name = uniqueName('linear');
    await page.getByPlaceholder('Name').fill(name);
    await shot(page, 'builder-02-save-modal');
    await page
      .getByRole('button', { name: 'Save', exact: true })
      .last()
      .click();
    await expect(page).toHaveURL(/\/reports\/[0-9a-f-]{36}/, {
      timeout: 30_000,
    });
    const reportId = page
      .url()
      .match(/reports\/([0-9a-f-]{36})/)?.[1] as string;

    await page.reload();
    await waitForChart(page);
    await expect(page.getByRole('button', { name })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update' })).toBeDisabled();

    await pickChartType(page, 'Linear', 'Bar');
    await waitForChart(page);
    await shot(page, 'builder-03-bar');
    await expect(page.getByRole('button', { name: 'Update' })).toBeEnabled({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Update' }).click();
    await expect(page.getByText('Report updated.')).toBeVisible();
    const saved = await trpcQuery<{
      chartType: string;
      series: unknown[];
      breakdowns: { name: string }[];
    }>(page, 'report.get', { reportId });
    expect(saved.chartType).toBe('bar');
    expect(saved.series).toHaveLength(2);
    expect(saved.breakdowns.map((breakdown) => breakdown.name)).toEqual([
      'device',
    ]);
    expect(problems.pageErrors).toEqual([]);
    expect(problems.responses).toEqual([]);
  } finally {
    await deleteDashboard(page, dashboard.id);
  }
});

test('every chart type renders the built report without errors', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const problems = trackProblems(page);
  await page.goto(`/acme/${SHOP}/reports`);
  await page.waitForLoadState('networkidle');
  await addEvent(page, 'purchase');
  await addEvent(page, 'add_to_cart');
  await closeSidebar(page);
  await waitForChart(page);
  const order = [
    'Linear',
    'Bar',
    'Histogram',
    'Pie',
    'Metric',
    'Area',
    'Map',
    'Funnel',
    'Conversion',
  ];
  for (let index = 1; index < order.length; index++) {
    await pickChartType(page, order[index - 1], order[index]);
    await waitForChart(page);
    await shot(page, `builder-10-${order[index].toLowerCase()}`);
    await expect(page.locator('#report-editor')).not.toContainText(
      /NaN|undefined|Something went wrong/
    );
  }
  expect(problems.pageErrors).toEqual([]);
  expect(problems.responses).toEqual([]);
});

test('checkout funnel matches the API and never grows between steps', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const problems = trackProblems(page);
  await page.goto(`/acme/${SHOP}/reports`);
  await page.waitForLoadState('networkidle');
  await openSidebar(page);
  await closeSidebar(page);
  await pickChartType(page, 'Linear', 'Funnel');
  for (const step of CHECKOUT_STEPS) {
    await addEvent(page, step);
  }
  await closeSidebar(page);
  await waitForChart(page);
  await shot(page, 'builder-20-funnel');
  const api = await trpcQuery<{ current: { steps: { count: number }[] }[] }>(
    page,
    'chart.funnel',
    reportInput(SHOP, {
      chartType: 'funnel',
      series: eventSeries(CHECKOUT_STEPS),
    })
  );
  const counts = api.current[0].steps.map((step) => step.count);
  expect(counts).toHaveLength(CHECKOUT_STEPS.length);
  for (let index = 1; index < counts.length; index++) {
    expect(counts[index]).toBeLessThanOrEqual(counts[index - 1]);
  }
  const funnelText = (await page.locator('#report-editor').innerText()).replace(
    /\s+/g,
    ' '
  );
  for (const [index, step] of CHECKOUT_STEPS.entries()) {
    expect(funnelText, `${step} shows ${counts[index]}`).toContain(
      `${step} ${counts[index]} `
    );
  }
  expect(problems.pageErrors).toEqual([]);
  expect(problems.responses).toEqual([]);
});

test('retention on acme-saas shows the cohort sizes the API returns', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const problems = trackProblems(page);
  await page.goto('/acme/acme-saas/reports');
  await page.waitForLoadState('networkidle');
  await openSidebar(page);
  await closeSidebar(page);
  await pickChartType(page, 'Linear', 'Retention');
  await addEvent(page, 'session_start');
  await addEvent(page, 'session_start');
  await closeSidebar(page);
  await waitForChart(page);
  await shot(page, 'builder-30-retention');
  const api = await trpcQuery<{ cohort_interval: string; sum: number }[]>(
    page,
    'chart.cohort',
    {
      projectId: 'acme-saas',
      firstEvent: ['session_start'],
      secondEvent: ['session_start'],
      criteria: 'on_or_after',
      interval: 'day',
      range: '30d',
    }
  );
  expect(api.length).toBeGreaterThan(5);
  const editor = page.locator('#report-editor');
  for (const cohort of api.slice(1, 6)) {
    const row = editor
      .locator('tr')
      .filter({ hasText: cohort.cohort_interval })
      .first();
    await expect(row).toContainText(String(cohort.sum));
  }
  expect(problems.pageErrors).toEqual([]);
  expect(problems.responses).toEqual([]);
});

test('sankey "between" mode shows the path from start to end event', async ({
  page,
}) => {
  const result = await trpcQuery<{ nodes: unknown[] }>(
    page,
    'chart.sankey',
    reportInput(SHOP, {
      chartType: 'sankey',
      series: eventSeries(['checkout_started', 'purchase']),
      options: { type: 'sankey', mode: 'between', steps: 10, exclude: [] },
    })
  );
  expect(result.nodes.length).toBeGreaterThan(0);
});

test('session and profile-field filters narrow the result', async ({
  page,
}) => {
  const total = async (extra: Record<string, unknown>) => {
    const result = await trpcQuery<{ series: ChartSeries[] }>(
      page,
      'chart.chart',
      reportInput(SHOP, { series: eventSeries(['screen_view']), ...extra })
    );
    return result.series.reduce((sum, serie) => sum + serie.metrics.sum, 0);
  };
  const unfiltered = await total({});
  const bounced = await total({
    globalFilters: [
      { id: 'g', name: 'session.is_bounce', operator: 'is', value: ['true'] },
    ],
  });
  const impossibleEmail = await total({
    globalFilters: [
      {
        id: 'g',
        name: 'profile.email',
        operator: 'is',
        value: ['nobody@example.invalid'],
        type: 'string',
      },
    ],
  });
  expect.soft(bounced).toBeLessThan(unfiltered);
  expect.soft(impossibleEmail).toBe(0);
});

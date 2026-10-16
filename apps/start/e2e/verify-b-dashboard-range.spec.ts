import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  eventSeries,
  hideFeedbackPrompt,
  reportInput,
  trpcMutation,
} from './reports-helpers';
import { shot } from './verify-b-helpers';

const SHOP = 'acme-shop';
const REPORT_NAME = 'E2E verify-b saved 30d week';

interface ChartCall {
  range: string;
  interval: string;
}

function recordChartCalls(page: Page) {
  const calls: ChartCall[] = [];
  page.on('request', (request) => {
    if (!request.url().includes('/trpc/chart.chart')) {
      return;
    }
    const input = JSON.parse(
      new URL(request.url()).searchParams.get('input') ?? '{}'
    ).json;
    calls.push({ range: input.range, interval: input.interval });
  });
  return calls;
}

async function rangeCookie(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === 'range')?.value;
}

test.use({ actionTimeout: 15_000 });

test('a dashboard card uses the range and interval saved on its report', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await hideFeedbackPrompt(page);
  await page.goto('/login');
  const dashboard = await trpcMutation<{ id: string }>(
    page,
    'dashboard.create',
    {
      name: `E2E verify-b range ${Date.now()}`,
      projectId: SHOP,
    }
  );
  try {
    const { projectId: _projectId, ...report } = reportInput(SHOP, {
      series: eventSeries(['purchase']),
      range: '30d',
      interval: 'week',
    });
    await trpcMutation(page, 'report.create', {
      dashboardId: dashboard.id,
      report: { ...report, name: REPORT_NAME },
    });
    expect(await rangeCookie(page), 'no range cookie yet').toBeUndefined();

    const calls = recordChartCalls(page);
    await page.goto(`/acme/${SHOP}/dashboards/${dashboard.id}`);
    await expect(page.getByText(REPORT_NAME)).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => calls.length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    await page.waitForLoadState('networkidle');
    await shot(page, 'item8-dashboard-fresh', false);
    const fresh = { ...calls[0] };

    // Choosing a range on the overview page changes what the dashboard opens with.
    await page.goto(`/acme/${SHOP}`);
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('button', { name: 'Last 7 days', exact: true })
      .click();
    await page.getByRole('menuitem', { name: /^Last 6 months/ }).click();
    await expect.poll(() => rangeCookie(page)).toContain('6m');
    calls.length = 0;
    await page.goto(`/acme/${SHOP}/dashboards/${dashboard.id}`);
    await expect(page.getByText(REPORT_NAME)).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(() => calls.length, { timeout: 30_000 })
      .toBeGreaterThan(0);
    await page.waitForLoadState('networkidle');
    await shot(page, 'item8-dashboard-after-overview-6m', false);
    const afterOverview = { ...calls[0] };

    expect.soft(fresh, 'fresh visit, no cookie').toEqual({
      range: '30d',
      interval: 'week',
    });
    expect
      .soft(afterOverview, 'after picking 6 months on the overview page')
      .toEqual({ range: '30d', interval: 'week' });
  } finally {
    await trpcMutation(page, 'dashboard.delete', {
      id: dashboard.id,
      forceDelete: true,
    });
  }
});

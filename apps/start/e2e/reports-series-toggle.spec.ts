// Toggling a series re-fits the y-axis with a short tween. The visible stroke
// of a series with a dashed tail is drawn from a measured copy of the path,
// so it must be re-measured once the tween settles or it stays where the old
// axis put it while the fill follows the new one.

import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  createDashboard,
  deleteDashboard,
  eventSeries,
  hideFeedbackPrompt,
  reportInput,
  shot,
  trpcMutation,
  waitForChart,
} from './reports-helpers';

const SHOP = 'acme-shop';
const Y_DOMAIN_TWEEN_SETTLE_MS = 1200;

interface StrokePaths {
  measured: string[];
  overlay: string[];
}

/**
 * The series stroke is split in two: a transparent path laid out from the
 * live scales (the measurement source) and the dashed-tail overlay that
 * paints the stroke from the last measurement. Both must agree.
 */
function strokePaths(chart: Locator): Promise<StrokePaths> {
  return chart
    .locator('svg')
    .first()
    .evaluate((svg) => {
      const paths = [...svg.querySelectorAll('path')];
      const unfilled = new Set(['none', 'transparent']);
      const measured = paths
        .filter(
          (path) =>
            path.getAttribute('stroke') === 'transparent' &&
            unfilled.has(path.getAttribute('fill') ?? 'none') &&
            !path.getAttribute('stroke-dasharray')
        )
        .map((path) => path.getAttribute('d') ?? '');
      const overlay = paths
        .filter((path) => path.getAttribute('stroke-dasharray'))
        .map((path) => path.getAttribute('d') ?? '');
      return { measured, overlay };
    });
}

async function expectStrokeFollowsScale(chart: Locator) {
  const { measured, overlay } = await strokePaths(chart);
  expect(overlay.length).toBeGreaterThan(0);
  for (const d of overlay) {
    expect(measured).toContain(d);
  }
}

async function createTwoSeriesReport(
  page: Page,
  dashboardId: string,
  chartType: 'linear' | 'area'
) {
  const { projectId: _projectId, ...report } = reportInput(SHOP, {
    chartType,
    series: eventSeries(['screen_view']),
    breakdowns: [{ id: 'b', name: 'device' }],
  });
  return trpcMutation<{ id: string }>(page, 'report.create', {
    dashboardId,
    report: { ...report, name: `E2E series toggle ${chartType}` },
  });
}

test.use({ actionTimeout: 15_000 });

test.beforeEach(async ({ page }) => {
  test.setTimeout(240_000);
  await hideFeedbackPrompt(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
});

for (const chartType of ['linear', 'area'] as const) {
  test(`${chartType} report: the stroke follows the axis after a series toggle`, async ({
    page,
  }) => {
    const dashboard = await createDashboard(page, SHOP, 'series-toggle');
    try {
      const report = await createTwoSeriesReport(page, dashboard.id, chartType);
      await page.goto(`/acme/${SHOP}/reports/${report.id}`);
      await page.waitForLoadState('networkidle');
      await waitForChart(page);
      const editor = page.locator('#report-editor');
      const chart = editor.locator(`[data-report-chart="${chartType}"]`);
      const visibleSeries = Number(
        await chart.getAttribute('data-visible-series')
      );
      expect(visibleSeries).toBeGreaterThan(1);
      await expectStrokeFollowsScale(chart);

      // The first row is the largest series, so hiding it moves the y-axis the most.
      await editor.getByRole('checkbox').first().click();
      await expect(chart).toHaveAttribute(
        'data-visible-series',
        String(visibleSeries - 1)
      );
      await page.waitForTimeout(Y_DOMAIN_TWEEN_SETTLE_MS);
      await shot(page, `series-toggle-${chartType}-hidden`);
      await expectStrokeFollowsScale(chart);

      await editor.getByRole('checkbox').first().click();
      await expect(chart).toHaveAttribute(
        'data-visible-series',
        String(visibleSeries)
      );
      await page.waitForTimeout(Y_DOMAIN_TWEEN_SETTLE_MS);
      await shot(page, `series-toggle-${chartType}-restored`);
      await expectStrokeFollowsScale(chart);
    } finally {
      await deleteDashboard(page, dashboard.id);
    }
  });
}

import { expect, test } from './fixtures';
import {
  addEvent,
  closeSidebar,
  openSidebar,
  pickChartType,
  shot,
  trackProblems,
  waitForChart,
} from './reports-helpers';

const SHOP = 'acme-shop';
const FIXED_LABEL = 'Fixed (0–100%)';
const PERCENT_LABEL = /^(\d+(\.\d+)?)%$/;

async function yAxisTickValues(page: Parameters<typeof shot>[0]) {
  const labels = await page
    .locator('[data-report-chart="conversion"] .text-chart-label')
    .allInnerTexts();
  return labels
    .map((label) => label.match(PERCENT_LABEL)?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number);
}

test.use({ actionTimeout: 20_000 });

test('conversion y-axis is fixed at 100% by default and auto fits the peak', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const problems = trackProblems(page);
  await page.goto(`/acme/${SHOP}/reports`);
  await page.waitForLoadState('networkidle');
  // Two events first: the conversion query rejects anything less.
  await addEvent(page, 'session_start');
  await addEvent(page, 'purchase');
  await closeSidebar(page);
  await pickChartType(page, 'Linear', 'Conversion');
  await waitForChart(page);

  const sheet = await openSidebar(page);
  const yAxis = sheet.getByRole('combobox').filter({ hasText: FIXED_LABEL });
  await expect(yAxis).toBeVisible();
  await closeSidebar(page);
  await waitForChart(page);
  await shot(page, 'conversion-y-axis-01-fixed');
  await expect.poll(() => yAxisTickValues(page)).not.toHaveLength(0);
  await expect.poll(() => yAxisTickValues(page)).toContain(100);

  await openSidebar(page);
  await yAxis.click();
  await page.getByRole('option', { name: 'Auto' }).click();
  await expect(
    sheet.getByRole('combobox').filter({ hasText: 'Auto' })
  ).toBeVisible();
  await closeSidebar(page);
  await waitForChart(page);
  await shot(page, 'conversion-y-axis-02-auto');
  await expect.poll(() => yAxisTickValues(page)).not.toHaveLength(0);
  await expect.poll(() => yAxisTickValues(page)).not.toContain(100);

  expect(problems.pageErrors).toEqual([]);
  expect(problems.responses).toEqual([]);
});

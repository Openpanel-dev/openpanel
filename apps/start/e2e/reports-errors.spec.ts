import { expect, test } from './fixtures';
import {
  addEvent,
  closeSidebar,
  hideFeedbackPrompt,
  openSidebar,
  pickChartType,
  shot,
  trackProblems,
  waitForChart,
} from './reports-helpers';

const SHOP = 'acme-shop';

test.use({ actionTimeout: 20_000 });

test.beforeEach(async ({ page }) => {
  await hideFeedbackPrompt(page);
});

test('a report id that does not exist shows a not-found state', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto(`/acme/${SHOP}/reports/00000000-0000-4000-8000-000000000000`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  await shot(page, 'err-01-missing-report');
  await expect(page.locator('body')).toContainText(
    /not found|does not exist|404/i,
    { timeout: 60_000 }
  );
});

test('an impossible filter shows the empty state, an invalid regex a readable error', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const problems = trackProblems(page);
  await page.goto(`/acme/${SHOP}/reports`);
  await page.waitForLoadState('networkidle');
  await addEvent(page, 'purchase');
  const sheet = await openSidebar(page);
  await sheet
    .getByRole('button', { name: 'Add filter', exact: true })
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'Event properties' }).click();
  await page.getByPlaceholder('Search').last().fill('payment');
  await page
    .locator('[data-radix-popper-content-wrapper]')
    .getByText('payment', { exact: true })
    .click();
  await sheet.getByRole('button', { name: 'Is', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Contains', exact: true }).click();
  const valueInput = sheet.locator('input').last();
  await valueInput.fill('no-such-payment-method');
  await valueInput.press('Enter');
  await closeSidebar(page);
  await waitForChart(page);
  await shot(page, 'err-10-impossible-filter');
  await expect(page.locator('#report-editor')).toContainText('No data');

  await openSidebar(page);
  await sheet.getByRole('button', { name: 'Contains', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Regex', exact: true }).click();
  await sheet.locator('input').last().fill('((');
  await sheet.locator('input').last().press('Enter');
  await closeSidebar(page);
  await waitForChart(page);
  await page.waitForTimeout(8000);
  await shot(page, 'err-11-invalid-regex');
  await expect
    .soft(page.locator('#report-editor'))
    .not.toContainText(/re2|OptimizedRegularExpression/);
  expect
    .soft(
      problems.responses.filter((line) => line.startsWith('500')),
      'an invalid regex is a validation error, not a 500'
    )
    .toEqual([]);
});

test('conversion with a single event explains what is missing instead of failing', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const problems = trackProblems(page);
  await page.goto(`/acme/${SHOP}/reports`);
  await page.waitForLoadState('networkidle');
  await addEvent(page, 'purchase');
  await closeSidebar(page);
  await pickChartType(page, 'Linear', 'Conversion');
  await waitForChart(page);
  await page.waitForTimeout(8000);
  await shot(page, 'err-20-conversion-one-event');
  expect(problems.responses.filter((line) => line.startsWith('500'))).toEqual(
    []
  );
});

test('leaving the builder and pressing back returns to the builder', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto(`/acme/${SHOP}/reports`);
  await page.waitForLoadState('networkidle');
  await addEvent(page, 'purchase');
  await closeSidebar(page);
  await waitForChart(page);
  await page.getByRole('link', { name: 'Dashboards' }).click();
  await expect(page).toHaveURL(/\/dashboards$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/reports$/);
  await page.waitForTimeout(5000);
  await shot(page, 'err-30-after-back');
  await expect(
    page,
    'going back keeps the user on the report builder'
  ).toHaveURL(/\/reports$/);
  await expect(page.getByRole('button', { name: 'Pick events' })).toBeVisible({
    timeout: 30_000,
  });
});

test('report builder fits a 390px viewport', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/acme/${SHOP}/reports`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);
  await shot(page, 'err-39-mobile-builder');
  await addEvent(page, 'purchase');
  await shot(page, 'err-40-mobile-sidebar');
  await closeSidebar(page);
  await waitForChart(page);
  await shot(page, 'err-41-mobile-chart');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

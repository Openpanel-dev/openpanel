import { expect, test } from './fixtures';
import {
  apiFailures,
  dismissFeedbackPrompt,
  expectNoCrashes,
  gotoHydrated,
  shot,
  watchProblems,
} from './org-helpers';

// The shared dev server takes 10-25s per navigation while other suites run.
const SLOW_DEV_SERVER_TIMEOUT_MS = 150_000;

test.setTimeout(SLOW_DEV_SERVER_TIMEOUT_MS);

// Plan rows start a real checkout when there is no current plan, so none is clicked.
test('billing renders plans, usage and the FAQ without errors', async ({
  page,
  seed,
}) => {
  const problems = watchProblems(page);
  await dismissFeedbackPrompt(page);
  await gotoHydrated(page, `/${seed.organizationId}/billing`);

  await expect(
    page.getByRole('heading', { name: 'Billing', level: 1 })
  ).toBeVisible();
  const yearlyPlan = page.getByRole('button', {
    name: /10K events per month \(yearly\)/,
  });
  await expect(yearlyPlan).toContainText('/yr');
  await expect(
    page.getByRole('button', { name: /events per month/ })
  ).toHaveCount(8);

  await page.getByRole('button', { name: 'Monthly' }).click();
  await expect(
    page.getByRole('button', { name: /^10K events per month/ })
  ).toContainText('/mo');
  await page.getByRole('button', { name: 'Yearly' }).click();
  await expect(yearlyPlan).toBeVisible();

  await expect(page.getByText('Usage', { exact: true })).toBeVisible();
  await expect(page.getByText('Limit', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/NaN|undefined/);

  const question = page.getByRole('button', {
    name: 'Does OpenPanel have a free tier?',
  });
  await question.click();
  await expect(page.getByText('30 days free trial')).toBeVisible();
  await question.click();
  await expect(page.getByText('30 days free trial')).toBeHidden();

  await shot(page, 'billing');
  expectNoCrashes(problems);
  expect(apiFailures(problems)).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  addEvent,
  closeSidebar,
  hideFeedbackPrompt,
  openSidebar,
  waitForChart,
} from './reports-helpers';
import { shot } from './verify-b-helpers';

interface Bucket {
  date: string;
  count: number;
}

/** Picks a range in the builder and returns the buckets the chart then draws. */
async function bucketsAfter(page: Page, action: () => Promise<void>) {
  const answered = page.waitForResponse(
    (response) =>
      response.url().includes('/trpc/chart.chart') && response.status() === 200
  );
  await action();
  const body = await (await answered).json();
  await waitForChart(page);
  const input = JSON.parse(
    new URL((await answered).url()).searchParams.get('input') ?? '{}'
  ).json;
  const buckets = (body.result.data.json.series[0]?.data ?? []) as Bucket[];
  return { buckets, interval: input.interval as string, range: input.range };
}

test.use({ actionTimeout: 20_000 });

test('report builder ranges: bucket counts at the edges', async ({ page }) => {
  test.setTimeout(240_000);
  await hideFeedbackPrompt(page);
  // acme-shop has live events from today, so "Today" returns a series.
  await page.goto('/acme/acme-shop/reports');
  await page.waitForLoadState('networkidle');
  await openSidebar(page);
  await closeSidebar(page);
  const pickRange = (current: string, next: RegExp) => async () => {
    await page.getByRole('button', { name: current, exact: true }).click();
    await page.getByRole('menuitem', { name: next }).click();
  };
  const month = await bucketsAfter(page, async () => {
    await addEvent(page, 'screen_view');
    await closeSidebar(page);
  });
  const week = await bucketsAfter(
    page,
    pickRange('Last 30 days', /^Last 7 days/)
  );
  await shot(page, 'item11-7d');
  const year = await bucketsAfter(
    page,
    pickRange('Last 7 days', /^Last 12 months/)
  );
  await shot(page, 'item11-12m');
  const today = await bucketsAfter(page, pickRange('Last 12 months', /^Today/));
  await shot(page, 'item11-today');

  const facts = {
    '7d': `${week.buckets.length} ${week.interval} buckets, ${week.buckets[0]?.date} .. ${week.buckets.at(-1)?.date}`,
    '30d': `${month.buckets.length} ${month.interval} buckets, ${month.buckets[0]?.date} .. ${month.buckets.at(-1)?.date}`,
    '12m': `${year.buckets.length} ${year.interval} buckets, ${year.buckets[0]?.date} .. ${year.buckets.at(-1)?.date}`,
    today: `${today.buckets.length} ${today.interval} buckets, ${today.buckets[0]?.date} .. ${today.buckets.at(-1)?.date}`,
  };
  for (const [range, description] of Object.entries(facts)) {
    test.info().annotations.push({ type: range, description });
  }
  console.log(JSON.stringify(facts, null, 1));

  // Whether N days means N or N+1 buckets is a product decision; a day has 24 hours either way.
  expect(today.interval).toBe('hour');
  expect(today.buckets.length, 'hourly buckets for Today').toBe(24);
});

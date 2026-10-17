import { expect, test } from './fixtures';
import {
  addEvent,
  closeSidebar,
  eventSeries,
  openSidebar,
  pickChartType,
  reportInput,
  shot,
  trackProblems,
  trpcQuery,
  waitForChart,
} from './reports-helpers';

const SHOP = 'acme-shop';
const STEPS = ['product_viewed', 'add_to_cart', 'checkout_started', 'purchase'];
const PURCHASE_STEP = 4;
const DID_NOT_REACH = `Did not reach step ${PURCHASE_STEP}`;

interface FunnelSerie {
  breakdowns: string[];
  steps: { count: number }[];
}

// `payment` is only set on `purchase`, so breaking down from the first step
// would put everyone in "Not set".
test('a funnel breaks down by a property that only exists on its last step', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const problems = trackProblems(page);
  await page.goto(`/acme/${SHOP}/reports`);
  await page.waitForLoadState('networkidle');
  await openSidebar(page);
  await closeSidebar(page);
  await pickChartType(page, 'Linear', 'Funnel');
  for (const step of STEPS) {
    await addEvent(page, step);
  }

  const sheet = await openSidebar(page);
  await sheet.getByRole('button', { name: 'Select breakdown' }).click();
  await page.getByRole('menuitem', { name: 'Event properties' }).click();
  await page.getByPlaceholder('Search').last().fill('payment');
  await page
    .locator('[data-radix-popper-content-wrapper]')
    .getByText('payment', { exact: true })
    .first()
    .click();
  await sheet
    .getByRole('combobox')
    .filter({ hasText: '1. product_viewed' })
    .click();
  await page
    .getByRole('option', { name: `${PURCHASE_STEP}. purchase` })
    .click();
  await shot(page, 'funnel-step-breakdown-sidebar');
  await closeSidebar(page);
  await waitForChart(page);
  await shot(page, 'funnel-step-breakdown');

  const { current } = await trpcQuery<{ current: FunnelSerie[] }>(
    page,
    'chart.funnel',
    reportInput(SHOP, {
      chartType: 'funnel',
      series: eventSeries(STEPS),
      breakdowns: [{ name: 'properties.payment', step: PURCHASE_STEP }],
    })
  );
  const segments = current.filter(
    (serie) => serie.breakdowns[0] !== DID_NOT_REACH
  );
  expect(segments.length).toBeGreaterThan(1);
  for (const serie of segments) {
    const counts = serie.steps.map((step) => step.count);
    expect(new Set(counts).size, serie.breakdowns.join()).toBe(1);
  }
  const dropped = current.find(
    (serie) => serie.breakdowns[0] === DID_NOT_REACH
  );
  expect(dropped?.steps.at(-1)?.count).toBe(0);

  const editorText = await page.locator('#report-editor').innerText();
  expect(editorText).toContain(DID_NOT_REACH);
  for (const serie of segments) {
    expect(editorText).toContain(serie.breakdowns[0] as string);
  }
  expect(problems.pageErrors).toEqual([]);
  expect(problems.responses).toEqual([]);
});

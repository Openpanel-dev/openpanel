import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  closeSidebar,
  hideFeedbackPrompt,
  openSidebar,
  pickChartType,
  waitForChart,
} from './reports-helpers';
import { shot, watch } from './verify-b-helpers';

const SAAS = 'acme-saas';
const CHART_ERROR = 'There was an error loading this chart.';

test.use({ actionTimeout: 20_000 });

/**
 * Adds `profile.properties.plan is pro` through the sidebar, as a global
 * filter or on the first event.
 */
async function addProfilePlanFilter(page: Page, scope: 'global' | 'event') {
  const sheet = await openSidebar(page);
  const addFilter = sheet.getByRole('button', { name: 'Add filter' });
  await (scope === 'global' ? addFilter.last() : addFilter.first()).click();
  await page.getByRole('menuitem', { name: 'Profile properties' }).click();
  await page
    .getByRole('menu')
    .getByPlaceholder('Search', { exact: true })
    .fill('plan');
  await page
    .locator('[data-radix-popper-content-wrapper]')
    .getByText('plan', { exact: true })
    .first()
    .click();
  await sheet.getByText('Select...').click();
  await page.getByRole('option').filter({ hasText: /^pro/ }).first().click();
  await page.keyboard.press('Escape');
  await closeSidebar(page);
}

/** `addEvent` from the reports helpers matches two comboboxes on a sankey. */
async function addEventExact(page: Page, name: string) {
  const sheet = await openSidebar(page);
  await sheet
    .getByRole('combobox')
    .filter({ hasText: /^Select event$/ })
    .click();
  await page.getByPlaceholder('Search event...').fill(name);
  await page
    .getByRole('option')
    .filter({ hasText: new RegExp(`^${name}(\\d|\\s|$)`) })
    .first()
    .click({ timeout: 15_000 });
}

async function buildReport(
  page: Page,
  chartType: string,
  events: readonly string[]
) {
  await hideFeedbackPrompt(page);
  await page.goto(`/acme/${SAAS}/reports`);
  await page.waitForLoadState('networkidle');
  await openSidebar(page);
  await closeSidebar(page);
  if (chartType !== 'Linear') {
    await pickChartType(page, 'Linear', chartType);
  }
  for (const event of events) {
    await addEventExact(page, event);
  }
  await closeSidebar(page);
  await waitForChart(page);
}

const CASES = [
  {
    chartType: 'Linear',
    events: ['signup_completed'],
    procedure: 'chart.chart',
    scope: 'global',
  },
  {
    chartType: 'Funnel',
    events: ['signup_completed', 'project_created'],
    procedure: 'chart.funnel',
    scope: 'global',
  },
  {
    chartType: 'Retention',
    events: ['signup_completed', 'session_start'],
    procedure: 'chart.cohort',
    scope: 'global',
  },
  {
    chartType: 'Conversion',
    events: ['signup_completed', 'project_created'],
    procedure: 'chart.conversion',
    scope: 'global',
  },
  {
    chartType: 'Sankey',
    events: ['signup_completed'],
    procedure: 'chart.sankey',
    scope: 'event',
  },
  // The sankey chart drops global filters from its request altogether.
  {
    chartType: 'Sankey',
    events: ['signup_completed'],
    procedure: 'chart.sankey',
    scope: 'global',
  },
] as const;

for (const { chartType, events, procedure, scope } of CASES) {
  test(`${chartType} report applies a ${scope} profile-property filter`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    watch(page);
    await buildReport(page, chartType, events);
    const editor = page.locator('#report-editor');
    await expect(editor).not.toContainText(CHART_ERROR);

    const filtered = page
      .waitForResponse(
        (response) => {
          const url = decodeURIComponent(response.url());
          return (
            url.includes(`/trpc/${procedure}`) &&
            url.includes('profile.properties.plan') &&
            url.includes('"pro"')
          );
        },
        { timeout: 20_000 }
      )
      .catch(() => null);
    await addProfilePlanFilter(page, scope);
    const response = await filtered;
    await page.waitForTimeout(1500);
    await shot(
      page,
      `item1-${chartType.toLowerCase()}-${scope}-profile-filter`
    );
    expect(response, 'the chart query carries the filter').not.toBeNull();
    expect(response?.status(), (await response?.text())?.slice(0, 200)).toBe(
      200
    );
    await expect(editor).not.toContainText(CHART_ERROR);
  });
}

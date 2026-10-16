import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  eventSeries,
  hideFeedbackPrompt,
  reportInput,
  trpcMutation,
  trpcQuery,
  waitForChart,
} from './reports-helpers';
import { shot } from './verify-b-helpers';

const SAAS = 'acme-saas';
const CHART_ERROR = 'There was an error loading this chart.';
const PLAN_BREAKDOWN = [{ id: 'plan', name: 'profile.properties.plan' }];

interface ChartSeries {
  names: string[];
  metrics: { sum: number };
}

interface FunnelSeries {
  breakdowns: string[];
  steps: { count: number }[];
}

/** Saves a report, opens it, and returns the rendered editor text. */
async function openReport(
  page: Page,
  name: string,
  input: Record<string, unknown>
) {
  const dashboard = await trpcMutation<{ id: string }>(
    page,
    'dashboard.create',
    { name: `E2E profile breakdown ${Date.now()}`, projectId: SAAS }
  );
  const { projectId: _projectId, ...report } = input;
  const created = await trpcMutation<{ id: string }>(page, 'report.create', {
    dashboardId: dashboard.id,
    report: { ...report, name },
  });
  await page.goto(`/acme/${SAAS}/reports/${created.id}`);
  await page.waitForLoadState('networkidle');
  await waitForChart(page);
  const text = (await page.locator('#report-editor').innerText()).replace(
    /\s+/g,
    ' '
  );
  return { dashboardId: dashboard.id, text };
}

function deleteDashboard(page: Page, id: string) {
  return trpcMutation(page, 'dashboard.delete', { id, forceDelete: true });
}

test.use({ actionTimeout: 15_000 });

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000);
  await hideFeedbackPrompt(page);
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('/login');
});

test('bar chart breaks unique users down by a profile property', async ({
  page,
}) => {
  const input = reportInput(SAAS, {
    chartType: 'bar',
    series: eventSeries(['screen_view'], { segment: 'user' }),
    breakdowns: PLAN_BREAKDOWN,
  });
  const api = await trpcQuery<{ series: ChartSeries[] }>(
    page,
    'chart.aggregate',
    input
  );
  const plans = api.series
    .map((serie) => serie.names.at(-1))
    .filter((plan): plan is string => !!plan && plan !== 'screen_view');
  expect(plans).toContain('free');

  const opened = await openReport(page, 'E2E users by plan', input);
  try {
    await shot(page, 'profile-breakdown-bar');
    expect(opened.text).not.toContain(CHART_ERROR);
    for (const plan of plans) {
      expect(opened.text).toContain(plan);
    }
  } finally {
    await deleteDashboard(page, opened.dashboardId);
  }
});

// The breakdown is read from step 1, so both steps happen after identification:
// signup_started still belongs to the anonymous device and has no plan.
test('funnel breaks down by a profile property', async ({ page }) => {
  const input = reportInput(SAAS, {
    chartType: 'funnel',
    series: eventSeries(['onboarding_step_completed', 'project_created']),
    breakdowns: PLAN_BREAKDOWN,
    options: { type: 'funnel', funnelGroup: 'profile_id' },
  });
  const api = await trpcQuery<{ current: FunnelSeries[] }>(
    page,
    'chart.funnel',
    input
  );
  const completedPlans = api.current
    .filter((serie) => (serie.steps.at(-1)?.count ?? 0) > 0)
    .map((serie) => serie.breakdowns[0]);
  expect(completedPlans).toContain('free');

  const opened = await openReport(page, 'E2E onboarding funnel by plan', input);
  try {
    await shot(page, 'profile-breakdown-funnel');
    expect(opened.text).not.toContain(CHART_ERROR);
    for (const plan of completedPlans) {
      expect(opened.text).toContain(plan);
    }
  } finally {
    await deleteDashboard(page, opened.dashboardId);
  }
});

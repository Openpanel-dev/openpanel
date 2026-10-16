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

interface FunnelSeries {
  breakdowns: string[];
  steps: { count: number; event: { name: string } }[];
}

const SIGNUP = [
  'screen_view',
  'plan_selected',
  'signup_started',
  'signup_completed',
];
const CHECKOUT = [
  'product_viewed',
  'add_to_cart',
  'checkout_started',
  'shipping_info_added',
  'payment_info_added',
  'purchase',
];

function funnelInput(
  projectId: string,
  steps: string[],
  overrides: Record<string, unknown>
) {
  return reportInput(projectId, {
    chartType: 'funnel',
    series: eventSeries(steps),
    ...overrides,
  });
}

/** Saves a funnel report, opens it, and returns the rendered text with the API result. */
async function openFunnel(
  page: Page,
  projectId: string,
  name: string,
  input: Record<string, unknown>
) {
  const dashboard = await trpcMutation<{ id: string }>(
    page,
    'dashboard.create',
    {
      name: `E2E verify-b funnel ${Date.now()}`,
      projectId,
    }
  );
  const { projectId: _projectId, ...report } = input;
  const created = await trpcMutation<{ id: string }>(page, 'report.create', {
    dashboardId: dashboard.id,
    report: { ...report, name },
  });
  const api = await trpcQuery<{ current: FunnelSeries[] }>(
    page,
    'chart.funnel',
    input
  );
  await page.goto(`/acme/${projectId}/reports/${created.id}`);
  await page.waitForLoadState('networkidle');
  await waitForChart(page);
  const text = (await page.locator('#report-editor').innerText()).replace(
    /\s+/g,
    ' '
  );
  return { dashboardId: dashboard.id, api: api.current, text };
}

test.use({ actionTimeout: 15_000 });

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000);
  await hideFeedbackPrompt(page);
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.goto('/login');
});

test('acme-web signup funnel grouped by profile reaches signup_completed', async ({
  page,
}) => {
  const session = await trpcQuery<{ current: FunnelSeries[] }>(
    page,
    'chart.funnel',
    funnelInput('acme-web', SIGNUP, {
      options: { type: 'funnel', funnelGroup: 'session_id' },
    })
  );
  const opened = await openFunnel(
    page,
    'acme-web',
    'E2E verify-b signup by profile',
    funnelInput('acme-web', SIGNUP, {
      options: { type: 'funnel', funnelGroup: 'profile_id' },
    })
  );
  try {
    await shot(page, 'item10-signup-profile-group');
    const counts = opened.api[0]?.steps.map((step) => step.count) ?? [];
    test.info().annotations.push({
      type: 'counts',
      description: `profile: ${counts.join(' -> ')}; session: ${session.current[0]?.steps.map((s) => s.count).join(' -> ')}`,
    });
    // The page shows what the API returned.
    for (const [index, step] of SIGNUP.entries()) {
      expect(opened.text).toContain(
        `${step} ${(counts[index] ?? 0).toLocaleString('en-US')} `
      );
    }
    // 48 sessions complete the signup; the people behind them did too.
    expect(session.current[0]?.steps.at(-1)?.count).toBeGreaterThan(0);
    expect(counts.at(-1), 'profiles completing signup').toBeGreaterThan(0);
  } finally {
    await trpcMutation(page, 'dashboard.delete', {
      id: opened.dashboardId,
      forceDelete: true,
    });
  }
});

test('acme-shop checkout funnel breaks down by payment method', async ({
  page,
}) => {
  const opened = await openFunnel(
    page,
    'acme-shop',
    'E2E verify-b checkout by payment',
    funnelInput('acme-shop', CHECKOUT, {
      breakdowns: [{ id: 'b', name: 'properties.payment' }],
    })
  );
  try {
    await shot(page, 'item10-checkout-by-payment');
    const labels = opened.api.map((serie) => serie.breakdowns.join('/'));
    test.info().annotations.push({
      type: 'breakdowns',
      description: labels.join(', '),
    });
    expect(opened.text).toContain('Not set');
    // purchase events carry payment = card / paypal / …
    expect(
      labels.filter((label) => label !== 'Not set').length
    ).toBeGreaterThan(0);
  } finally {
    await trpcMutation(page, 'dashboard.delete', {
      id: opened.dashboardId,
      forceDelete: true,
    });
  }
});

test('acme-shop checkout funnel breaks down by category (carried by step 1)', async ({
  page,
}) => {
  const opened = await openFunnel(
    page,
    'acme-shop',
    'E2E verify-b checkout by category',
    funnelInput('acme-shop', CHECKOUT, {
      breakdowns: [{ id: 'b', name: 'properties.category' }],
    })
  );
  try {
    await shot(page, 'item10-checkout-by-category');
    const labels = opened.api.map((serie) => serie.breakdowns.join('/'));
    expect(labels.length).toBeGreaterThan(3);
    for (const label of labels.slice(0, 3)) {
      expect(opened.text).toContain(label);
    }
  } finally {
    await trpcMutation(page, 'dashboard.delete', {
      id: opened.dashboardId,
      forceDelete: true,
    });
  }
});

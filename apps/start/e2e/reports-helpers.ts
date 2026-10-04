import type { Page } from '@playwright/test';

export const API_URL = 'https://api.main.local.openpanel.cc';
export const ORGANIZATION_ID = 'acme';
export const SHOTS_DIR = 'test-results/reports/shots';

const IGNORED_CONSOLE = [
  /vite/i,
  /favicon/i,
  /sentry/i,
  /Download the React DevTools/i,
  /\[HMR\]/i,
  /status of 401/i,
  /hydrat/i,
];

export interface PageProblems {
  console: string[];
  pageErrors: string[];
  responses: string[];
}

export function trackProblems(page: Page): PageProblems {
  const problems: PageProblems = { console: [], pageErrors: [], responses: [] };
  page.on('console', (message) => {
    if (message.type() !== 'error') {
      return;
    }
    const text = message.text();
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) {
      return;
    }
    problems.console.push(text.slice(0, 500));
  });
  page.on('pageerror', (error) => {
    problems.pageErrors.push(String(error).slice(0, 500));
  });
  page.on('response', (response) => {
    if (
      response.status() >= 400 &&
      !/favicon|sentry|api\.openpanel\.dev/.test(response.url())
    ) {
      problems.responses.push(
        `${response.status()} ${response.request().method()} ${response.url().slice(0, 300)}`
      );
    }
  });
  return problems;
}

export async function trpcQuery<T = unknown>(
  page: Page,
  procedure: string,
  input: unknown
): Promise<T> {
  const response = await page.request.get(
    `${API_URL}/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
  );
  const body = await response.json();
  if (!response.ok()) {
    throw new Error(
      `${procedure} ${response.status()}: ${JSON.stringify(body).slice(0, 400)}`
    );
  }
  return body.result.data.json as T;
}

export async function trpcMutation<T = unknown>(
  page: Page,
  procedure: string,
  input: unknown
): Promise<T> {
  const response = await page.request.post(`${API_URL}/trpc/${procedure}`, {
    data: { json: input },
  });
  const body = await response.json();
  if (!response.ok()) {
    throw new Error(
      `${procedure} ${response.status()}: ${JSON.stringify(body).slice(0, 400)}`
    );
  }
  return body.result.data.json as T;
}

export function uniqueName(label: string): string {
  return `E2E reports ${label} ${Date.now()}`;
}

export async function createDashboard(
  page: Page,
  projectId: string,
  label: string
): Promise<{ id: string; name: string }> {
  return trpcMutation(page, 'dashboard.create', {
    name: uniqueName(label),
    projectId,
  });
}

export async function deleteDashboard(page: Page, id: string): Promise<void> {
  await trpcMutation(page, 'dashboard.delete', { id, forceDelete: true });
}

export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS_DIR}/${name}.png`, fullPage: true });
}

export async function hideFeedbackPrompt(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: 'feedback-prompt-seen',
      value: encodeURIComponent(JSON.stringify(new Date().toISOString())),
      domain: 'main.local.openpanel.cc',
      path: '/',
    },
  ]);
}

interface SeriesEvent {
  id: string;
  type: 'event';
  name: string;
  segment: string;
  filters: unknown[];
  property?: string;
}

export function eventSeries(
  names: string[],
  overrides: Partial<SeriesEvent> = {}
): SeriesEvent[] {
  return names.map((name, index) => ({
    id: String.fromCharCode(65 + index),
    type: 'event',
    name,
    segment: 'event',
    filters: [],
    ...overrides,
  }));
}

export function reportInput(
  projectId: string,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  return {
    projectId,
    chartType: 'linear',
    interval: 'day',
    range: '30d',
    series: [],
    breakdowns: [],
    previous: false,
    metric: 'sum',
    lineType: 'monotone',
    ...overrides,
  };
}

export async function createReport(
  page: Page,
  dashboardId: string,
  name: string,
  report: Record<string, unknown>
): Promise<{ id: string; name: string }> {
  const { projectId: _projectId, ...rest } = report;
  return trpcMutation(page, 'report.create', {
    dashboardId,
    report: { ...rest, name },
  });
}

/** The editor shows a "Stay calm" placeholder while the chart query runs. */
export async function waitForChart(page: Page): Promise<void> {
  const editor = page.locator('#report-editor');
  await editor.waitFor({ timeout: 45_000 });
  await page
    .waitForFunction(
      () => {
        const element = document.querySelector('#report-editor');
        const text = element?.textContent ?? '';
        return (
          text.length > 0 &&
          !text.includes('Stay calm') &&
          !element?.querySelector('.animate-pulse')
        );
      },
      undefined,
      { timeout: 45_000 }
    )
    .catch(() => undefined);
  await page.waitForTimeout(700);
}

export async function openSidebar(page: Page) {
  const sheet = page.locator('[role="dialog"][aria-describedby]');
  for (let attempt = 0; attempt < 10; attempt++) {
    if (await sheet.isVisible()) {
      return sheet;
    }
    await page
      .getByRole('button', { name: 'Pick events' })
      .click({ timeout: 3000 })
      .catch(() => undefined);
    await sheet.waitFor({ timeout: 5000 }).catch(() => undefined);
  }
  throw new Error('The report sidebar never opened');
}

export async function addEvent(page: Page, name: string): Promise<void> {
  const sheet = await openSidebar(page);
  await sheet.getByRole('combobox').filter({ hasText: 'Select event' }).click();
  await page.getByPlaceholder('Search event...').fill(name);
  await page
    .getByRole('option')
    .filter({ hasText: new RegExp(`^${name}(\\d|\\s|$)`) })
    .first()
    .click({ timeout: 15_000 });
}

export async function pickChartType(
  page: Page,
  current: string,
  next: string
): Promise<void> {
  await page.getByRole('button', { name: current, exact: true }).click();
  await page.getByRole('menuitem', { name: next }).click();
}

export async function closeSidebar(page: Page): Promise<void> {
  const sheet = page.locator('[role="dialog"][aria-describedby]');
  await sheet.getByRole('button', { name: 'Done' }).click();
  await sheet.waitFor({ state: 'hidden' });
}

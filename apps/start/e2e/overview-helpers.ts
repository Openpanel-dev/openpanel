import type { Page, TestInfo } from '@playwright/test';

export const SHOTS_DIR = 'test-results/overview-shots';
export const API_URL = 'https://api.main.local.openpanel.cc';
const API_TIMEOUT_MS = 60_000;
export const PROJECT_IDS = [
  'acme-web',
  'acme-saas',
  'acme-shop',
  'acme-app',
] as const;

const NOISE_PATTERNS = [
  /\[vite\]/i,
  /favicon/i,
  /sentry/i,
  /Download the React DevTools/i,
  /node_modules\/\.vite/i,
  /tree hydrated but some attributes/i,
  /status of 401 \(\)/i,
  /status of 502 \(\)/i,
  /net::ERR_ABORTED/i,
];

export interface PageProblems {
  consoleErrors: string[];
  pageErrors: string[];
  badResponses: string[];
  all: () => string[];
}

/** Records console errors, uncaught exceptions and >= 400 responses. */
export function watchPage(page: Page): PageProblems {
  const problems: PageProblems = {
    consoleErrors: [],
    pageErrors: [],
    badResponses: [],
    all: () => [
      ...problems.consoleErrors.map((e) => `console: ${e}`),
      ...problems.pageErrors.map((e) => `pageerror: ${e}`),
      ...problems.badResponses.map((e) => `response: ${e}`),
    ],
  };
  const isNoise = (text: string) => NOISE_PATTERNS.some((p) => p.test(text));
  page.on('console', (message) => {
    if (message.type() === 'error' && !isNoise(message.text())) {
      problems.consoleErrors.push(message.text().slice(0, 500));
    }
  });
  page.on('pageerror', (error) => {
    problems.pageErrors.push(String(error).slice(0, 500));
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !isNoise(response.url())) {
      problems.badResponses.push(
        `${response.status()} ${response.url().slice(0, 300)}`
      );
    }
  });
  return problems;
}

export async function shot(page: Page, name: string, fullPage = true) {
  await page.screenshot({ path: `${SHOTS_DIR}/${name}.png`, fullPage });
}

export async function attachProblems(
  testInfo: TestInfo,
  problems: PageProblems
) {
  if (problems.all().length > 0) {
    await testInfo.attach('page-problems', {
      body: problems.all().join('\n'),
      contentType: 'text/plain',
    });
  }
}

/** Calls a tRPC query with the page's own session cookie. */
export async function trpcQuery<T>(
  page: Page,
  procedure: string,
  input: Record<string, unknown>
): Promise<T> {
  const response = await page.request.get(
    `${API_URL}/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`,
    { timeout: API_TIMEOUT_MS }
  );
  if (!response.ok()) {
    throw new Error(
      `${procedure} -> ${response.status()} ${(await response.text()).slice(0, 300)}`
    );
  }
  const body = await response.json();
  return body.result.data.json as T;
}

export async function gotoReady(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

// The shared dev stack is slow while other suites run against it.
export const SLOW_TEST_TIMEOUT_MS = 300_000;

export function metricCard(page: Page, title: string) {
  return page
    .locator('div.card.grid')
    .first()
    .getByRole('button', { name: new RegExp(`^${title}`) });
}

const HYDRATION_ATTEMPT_TIMEOUT_MS = 30_000;
const HYDRATION_ATTEMPTS = 4;

/**
 * The overview has loaded once the first metric card shows a number. Under
 * load the dev server sometimes answers 502 for a module, which leaves the
 * server-rendered skeleton unhydrated forever; a reload recovers.
 */
export async function overviewReady(page: Page) {
  const firstValue = metricCard(page, 'Unique Visitors')
    .locator('span.font-mono')
    .first();
  for (let attempt = 1; attempt <= HYDRATION_ATTEMPTS; attempt++) {
    const loaded = await firstValue
      .waitFor({ timeout: HYDRATION_ATTEMPT_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
    if (loaded) {
      break;
    }
    if (attempt === HYDRATION_ATTEMPTS) {
      throw new Error('overview never left its loading skeleton');
    }
    await page.reload();
  }
  await page.waitForLoadState('networkidle');
}

export async function gotoOverview(page: Page, projectId: string, query = '') {
  await page.goto(`/acme/${projectId}${query}`);
  await overviewReady(page);
}

export function mainChart(page: Page) {
  return page.locator('div.h-\\[190px\\]');
}

export async function dismissFeedbackPrompt(page: Page) {
  const prompt = page.getByText('Share Your Feedback');
  if (await prompt.isVisible().catch(() => false)) {
    await prompt.locator('..').getByRole('button').first().click();
  }
}

export interface OverviewStats {
  metrics: Record<string, number | null>;
  series: Record<string, number | string | null | undefined>[];
}

export interface OverviewFilter {
  id: string;
  name: string;
  operator: string;
  value: string[];
}

export function filter(
  name: string,
  value: string[],
  operator = 'is'
): OverviewFilter {
  return { id: name, name, operator, value };
}

export function fetchStats(
  page: Page,
  projectId: string,
  input: Record<string, unknown>
) {
  return trpcQuery<OverviewStats>(page, 'overview.stats', {
    projectId,
    range: '7d',
    interval: 'day',
    filters: [],
    ...input,
  });
}

export const compactNumber = (value: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value);

export function expectNoRealProblems(problems: PageProblems) {
  // The dashboard's own product analytics call (no key locally) and the
  // overloaded dev server's module 502s are not the app under test.
  const responses = problems.badResponses.filter(
    (r) => !(r.includes('api.openpanel.dev') || /^502 /.test(r))
  );
  const pageErrors = problems.pageErrors.filter(
    (e) => !e.includes('Failed to fetch dynamically imported module')
  );
  return { pageErrors, responses };
}

export async function trpcMutation<T>(
  page: Page,
  procedure: string,
  input: Record<string, unknown>
): Promise<T> {
  const response = await page.request.post(`${API_URL}/trpc/${procedure}`, {
    data: { json: input },
    timeout: API_TIMEOUT_MS,
  });
  if (!response.ok()) {
    throw new Error(
      `${procedure} -> ${response.status()} ${(await response.text()).slice(0, 300)}`
    );
  }
  const body = await response.json();
  return body.result.data.json as T;
}

const CHART_MARGIN_X = 20;

/** Hovers the main chart over the bucket at `index` and returns the tooltip text. */
export async function hoverBucket(page: Page, index: number, buckets: number) {
  const chart = mainChart(page);
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  if (!box) {
    throw new Error('main chart is not visible');
  }
  const innerWidth = box.width - CHART_MARGIN_X * 2;
  const x = box.x + CHART_MARGIN_X + (innerWidth * index) / (buckets - 1);
  // Approach from the side so the chart sees a real mouse move.
  await page.mouse.move(x - 3, box.y + 70);
  await page.mouse.move(x, box.y + 80);
  const tooltip = page.locator('.pointer-events-none.absolute.z-50').last();
  await tooltip.waitFor();
  await page.waitForTimeout(250);
  return tooltip.innerText();
}

/** Index the dashed "incomplete" tail starts at, or null when the line is solid. */
export async function dashedTailStartIndex(page: Page, buckets: number) {
  const dashArrays = await mainChart(page)
    .locator('path[stroke-dasharray]')
    .evaluateAll((paths) =>
      paths.map((path) => path.getAttribute('stroke-dasharray') ?? '')
    );
  const hasDashedTail = dashArrays.includes('4,4');
  const solid = dashArrays.find((value) => /^[\d.]+ [\d.]+$/.test(value));
  if (!(hasDashedTail && solid)) {
    return null;
  }
  const [solidLength, rest] = solid.split(' ').map(Number);
  return Math.round(
    ((solidLength ?? 0) / ((solidLength ?? 0) + (rest ?? 0))) * (buckets - 1)
  );
}

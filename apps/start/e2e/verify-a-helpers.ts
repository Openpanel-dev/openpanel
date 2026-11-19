import type { APIRequestContext, Page } from '@playwright/test';

export const API_URL =
  process.env.API_URL ?? 'https://api.main.local.openpanel.cc';
export const SHOTS_DIR = 'test-results/verify-a/shots';

const DEFAULT_CLICKHOUSE_URL = 'http://localhost:23123/openpanel';
const HYDRATION_TIMEOUT_MS = 45_000;

/** Read-only ClickHouse query over HTTP; returns the first cell as a number. */
export async function clickhouseNumber(query: string): Promise<number> {
  const configured = new URL(
    process.env.CLICKHOUSE_URL ?? DEFAULT_CLICKHOUSE_URL
  );
  const database = configured.pathname.replace('/', '') || 'default';
  const response = await fetch(
    `${configured.origin}/?database=${database}&readonly=1`,
    { method: 'POST', body: `${query} FORMAT TSV` }
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`ClickHouse ${response.status}: ${text.slice(0, 300)}`);
  }
  return Number(text.trim().split('\t')[0]);
}

export async function clickhouseText(query: string): Promise<string> {
  const configured = new URL(
    process.env.CLICKHOUSE_URL ?? DEFAULT_CLICKHOUSE_URL
  );
  const database = configured.pathname.replace('/', '') || 'default';
  const response = await fetch(
    `${configured.origin}/?database=${database}&readonly=1`,
    { method: 'POST', body: `${query} FORMAT TSV` }
  );
  return (await response.text()).trim();
}

export async function trpcQuery<T>(
  request: APIRequestContext,
  procedure: string,
  input?: unknown
): Promise<T> {
  const query =
    input === undefined
      ? ''
      : `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const response = await request.get(`${API_URL}/trpc/${procedure}${query}`);
  const body = await response.json();
  if (!response.ok()) {
    throw new Error(
      `${procedure} ${response.status()}: ${JSON.stringify(body).slice(0, 300)}`
    );
  }
  return body.result.data.json as T;
}

export async function trpcMutation<T>(
  request: APIRequestContext,
  procedure: string,
  input?: unknown
): Promise<T> {
  const response = await request.post(`${API_URL}/trpc/${procedure}`, {
    data: { json: input ?? null },
  });
  const body = await response.json();
  if (!response.ok()) {
    throw new Error(
      `${procedure} ${response.status()}: ${JSON.stringify(body).slice(0, 300)}`
    );
  }
  return body.result.data.json as T;
}

/** The feedback card covers the bottom-right corner for accounts that have not dismissed it. */
export async function hideFeedbackPrompt(page: Page): Promise<void> {
  await page.context().addCookies([
    {
      name: 'feedback-prompt-seen',
      value: new Date().toISOString(),
      url: process.env.DASHBOARD_URL ?? 'http://localhost:3000',
    },
  ]);
}

/** `networkidle` is reached before React attaches on the dev server; a click before that is lost. */
export async function openHydrated(page: Page, path: string): Promise<void> {
  await hideFeedbackPrompt(page);
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(
    () => {
      const probe = document.querySelector('button, a');
      return (
        probe !== null &&
        Object.keys(probe).some((key) => key.startsWith('__reactFiber$'))
      );
    },
    undefined,
    { timeout: HYDRATION_TIMEOUT_MS }
  );
}

/** Uncaught errors and failed API calls; module 502s and analytics noise are not the page's fault. */
export function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => {
    if (!/hydrat/i.test(error.message)) {
      problems.push(`pageerror: ${error.message.slice(0, 300)}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('/trpc/')) {
      problems.push(
        `${response.status()} ${decodeURIComponent(response.url()).slice(0, 240)}`
      );
    }
  });
  return problems;
}

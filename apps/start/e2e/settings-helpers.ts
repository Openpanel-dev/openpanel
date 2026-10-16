// Shared by the settings-*.spec.ts files: a throwaway project per spec file,
// tRPC as the seeded user, and the console/network recorder every spec attaches.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type APIRequestContext,
  type BrowserContext,
  expect,
  type Locator,
  type Page,
  request,
} from '@playwright/test';

const AUTH_STATE_FILE = resolve(import.meta.dirname, '.auth', 'user.json');
const SEED_FILE = resolve(import.meta.dirname, '..', '..', '..', '.seed.json');
const SCREENSHOT_DIR = 'test-results/settings/shots';

/** The dev server is shared with other suites; a cold route can take a while. */
export const SLOW_TEST_TIMEOUT_MS = 240_000;
export const SLOW_ASSERT = { timeout: 45_000 };

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36';

export function apiUrl(): string {
  const manifest = JSON.parse(readFileSync(SEED_FILE, 'utf8')) as {
    apiUrl: string;
  };
  return process.env.API_URL ?? manifest.apiUrl;
}

export function seededApi(): Promise<APIRequestContext> {
  return request.newContext({
    storageState: AUTH_STATE_FILE,
    ignoreHTTPSErrors: true,
  });
}

/** Playwright applies the project's storage state to every new context unless told otherwise. */
export const LOGGED_OUT = {
  ignoreHTTPSErrors: true,
  storageState: { cookies: [], origins: [] },
};

export function anonymousApi(): Promise<APIRequestContext> {
  return request.newContext(LOGGED_OUT);
}

interface TrpcResult<T> {
  status: number;
  data: T | undefined;
  errorMessage: string | undefined;
}

interface TrpcEnvelope<T> {
  result?: { data?: { json?: T } };
  error?: { json?: { message?: string } };
}

async function unwrap<T>(
  response: Awaited<ReturnType<APIRequestContext['get']>>
): Promise<TrpcResult<T>> {
  // A non-JSON body (a proxy error page) is reported as a bare status.
  const body = (await response
    .json()
    .catch(() => null)) as TrpcEnvelope<T> | null;
  return {
    status: response.status(),
    data: body?.result?.data?.json,
    errorMessage: body?.error?.json?.message,
  };
}

export async function trpcQuery<T = unknown>(
  api: APIRequestContext,
  procedure: string,
  input: unknown
): Promise<TrpcResult<T>> {
  const query = encodeURIComponent(JSON.stringify({ json: input }));
  return unwrap<T>(
    await api.get(`${apiUrl()}/trpc/${procedure}?input=${query}`)
  );
}

export async function trpcMutation<T = unknown>(
  api: APIRequestContext,
  procedure: string,
  input: unknown
): Promise<TrpcResult<T>> {
  return unwrap<T>(
    await api.post(`${apiUrl()}/trpc/${procedure}`, { data: { json: input } })
  );
}

export interface ThrowawayProject {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string;
}

export async function createThrowawayProject(
  api: APIRequestContext,
  organizationId: string,
  label: string
): Promise<ThrowawayProject> {
  const name = `E2E settings ${label} ${Date.now()}`;
  const created = await trpcMutation<{
    id: string;
    client: { id: string; secret: string };
  }>(api, 'project.create', {
    organizationId,
    project: name,
    domain: null,
    cors: [],
    website: false,
    app: false,
    backend: true,
  });
  if (!created.data) {
    throw new Error(
      `project.create failed (${created.status}): ${created.errorMessage}`
    );
  }
  return {
    id: created.data.id,
    name,
    clientId: created.data.client.id,
    clientSecret: created.data.client.secret,
  };
}

/** Projects are soft-deleted: this schedules the deletion the hourly cron performs. */
export async function scheduleProjectDeletion(
  api: APIRequestContext,
  projectId: string
): Promise<void> {
  await trpcMutation(api, 'project.delete', { projectId });
}

export function sendTrackEvent(
  api: APIRequestContext,
  client: { id: string; secret: string },
  name: string,
  properties: Record<string, unknown> = {}
) {
  return api.post(`${apiUrl()}/track`, {
    headers: {
      'openpanel-client-id': client.id,
      'openpanel-client-secret': client.secret,
      'user-agent': BROWSER_USER_AGENT,
      'x-client-ip': '81.2.69.142',
    },
    data: { type: 'track', payload: { name, properties } },
  });
}

/** The feedback card is fixed over the bottom-right corner and swallows clicks there. */
export async function hideFeedbackPrompt(
  context: BrowserContext,
  baseURL: string | undefined
): Promise<void> {
  if (!baseURL) {
    return;
  }
  await context.addCookies([
    {
      name: 'feedback-prompt-seen',
      value: encodeURIComponent(new Date().toISOString()),
      url: baseURL,
    },
  ]);
}

const IGNORED_NOISE = [
  /api\.openpanel\.dev/, // the dashboard's own analytics, unauthenticated locally
  /status of 401/, // console echo of the line above
  /hydrated but some attributes/, // reported once in the sweep, not per test
  /@vite|\/@id\/|\/@fs\/|\/src\/.*\.(tsx?|css)(\?|$)|node_modules\/\.vite/, // dev-server module noise
  /status of 502/, // console echo of a dev-server module 502
  /favicon/,
  /sentry/i,
  /cdn\.brandfetch\.io|googleusercontent|vecteezy/, // third-party logos
];

export interface PageIssues {
  list: string[];
  expectNone: () => void;
}

export function recordPageIssues(page: Page): PageIssues {
  const list: string[] = [];
  const add = (issue: string) => {
    if (!IGNORED_NOISE.some((pattern) => pattern.test(issue))) {
      list.push(issue);
    }
  };
  page.on('console', (message) => {
    if (message.type() === 'error') {
      add(`console: ${message.text().slice(0, 400)}`);
    }
  });
  page.on('pageerror', (error) => add(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      add(
        `${response.status()} ${response.request().method()} ${response.url()}`
      );
    }
  });
  return {
    list,
    expectNone: () =>
      expect(list, 'console errors / failed requests').toEqual([]),
  };
}

const HYDRATION_ATTEMPTS = 3;
const HYDRATION_TIMEOUT_MS = 25_000;

function isHydrated(locator: Locator): Promise<boolean> {
  return locator
    .first()
    .evaluate((element) =>
      Object.keys(element).some((key) => key.startsWith('__reactProps'))
    )
    .catch(() => false);
}

/**
 * SSR paints the page long before React attaches handlers; a click or fill in
 * between is silently lost. React marks hydrated DOM nodes with `__reactProps$…`.
 * The shared dev server sometimes fails to serve the client entry, which leaves
 * the page inert until it is loaded again.
 */
export async function gotoHydrated(
  page: Page,
  path: string,
  marker: (page: Page) => Locator
): Promise<void> {
  for (let attempt = 1; attempt <= HYDRATION_ATTEMPTS; attempt++) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const hydrated = await expect
      .poll(() => isHydrated(marker(page)), { timeout: HYDRATION_TIMEOUT_MS })
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    if (hydrated) {
      return;
    }
  }
  throw new Error(`${path} did not hydrate after ${HYDRATION_ATTEMPTS} loads`);
}

export async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${name}.png`,
    fullPage: true,
  });
}

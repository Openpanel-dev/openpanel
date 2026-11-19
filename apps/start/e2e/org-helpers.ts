import type { Page, TestInfo } from '@playwright/test';

const HYDRATION_ATTEMPTS = 4;
const HYDRATION_TIMEOUT_MS = 25_000;

export const SHOTS_DIR = 'test-results/org/shots';
export const API_URL =
  process.env.API_URL ?? 'https://api.main.local.openpanel.cc';

const NOISE = [
  /favicon/,
  /sentry/i,
  /\[vite\]/,
  /hmr/i,
  /Download the React DevTools/,
  /userjot/i,
  /net::ERR_ABORTED/,
];

export interface Problems {
  consoleErrors: string[];
  pageErrors: string[];
  badResponses: string[];
}

export function watchProblems(page: Page): Problems {
  const problems: Problems = {
    consoleErrors: [],
    pageErrors: [],
    badResponses: [],
  };
  const isNoise = (text: string) => NOISE.some((pattern) => pattern.test(text));
  page.on('console', (message) => {
    if (message.type() === 'error' && !isNoise(message.text())) {
      problems.consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    problems.pageErrors.push(String(error));
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !isNoise(response.url())) {
      problems.badResponses.push(
        `${response.status()} ${response.request().method()} ${response.url()}`
      );
    }
  });
  return problems;
}

export async function attachProblems(testInfo: TestInfo, problems: Problems) {
  await testInfo.attach('problems', {
    body: JSON.stringify(problems, null, 2),
    contentType: 'application/json',
  });
}

export async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS_DIR}/${name}.png`, fullPage: true });
}

export async function trpcQuery<T>(
  page: Page,
  path: string,
  input?: unknown
): Promise<T> {
  const query =
    input === undefined
      ? ''
      : `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const response = await page.request.get(`${API_URL}/trpc/${path}${query}`);
  const body = await response.json();
  if (!response.ok()) {
    throw new Error(
      `${path} ${response.status()}: ${JSON.stringify(body).slice(0, 300)}`
    );
  }
  return body.result.data.json as T;
}

export async function trpcMutation<T>(
  page: Page,
  path: string,
  input: unknown
): Promise<{ status: number; data?: T; error?: string }> {
  const response = await page.request.post(`${API_URL}/trpc/${path}`, {
    data: { json: input },
  });
  const body = await response.json();
  if (!response.ok()) {
    return { status: response.status(), error: body?.error?.json?.message };
  }
  return { status: response.status(), data: body.result.data.json as T };
}

/**
 * `networkidle` can be reached before React has hydrated the sidebar on the dev
 * server, so a first click on a menu trigger is sometimes swallowed.
 */
export async function openMenu(
  page: Page,
  trigger: import('@playwright/test').Locator
) {
  const menu = page.getByRole('menu');
  // A menu that is still animating out would satisfy the wait below.
  await menu.first().waitFor({ state: 'detached' });
  for (let attempt = 0; attempt < 10; attempt++) {
    await trigger.click();
    try {
      await menu.first().waitFor({ state: 'visible', timeout: 1500 });
      return menu.first();
    } catch {
      // Not hydrated yet; click again.
      if (await menu.first().isVisible()) {
        return menu.first();
      }
    }
  }
  throw new Error('Menu did not open');
}

/**
 * `networkidle` is not hydration: on the dev server the SSR markup is
 * interactive-looking well before React attaches, and input typed in that
 * window never reaches react-hook-form. React tags hydrated nodes with a
 * `__reactFiber$` key, which is the only client-side signal available.
 */
export async function gotoHydrated(page: Page, url: string) {
  const isHydrated = () => {
    const probe = document.querySelector('button, a');
    return (
      !!probe &&
      Object.keys(probe).some((key) => key.startsWith('__reactFiber$'))
    );
  };
  // A 502 on one module request (Vite re-optimizing under load) leaves the
  // page server-rendered forever; only a fresh load recovers.
  for (let attempt = 0; attempt < HYDRATION_ATTEMPTS; attempt++) {
    await page.goto(url);
    try {
      await page.waitForLoadState('networkidle', {
        timeout: HYDRATION_TIMEOUT_MS,
      });
      await page.waitForFunction(isHydrated, undefined, {
        timeout: HYDRATION_TIMEOUT_MS,
      });
      return;
    } catch {
      // Try again with a fresh document.
    }
  }
  throw new Error(`${url} did not hydrate`);
}

export async function dismissFeedbackPrompt(page: Page) {
  const { hostname } = new URL(
    process.env.DASHBOARD_URL ?? 'https://main.local.openpanel.cc'
  );
  await page.context().addCookies([
    {
      name: 'feedback-prompt-seen',
      value: new Date().toISOString(),
      domain: hostname,
      path: '/',
    },
  ]);
}

export function expectNoCrashes(problems: Problems) {
  if (problems.pageErrors.length > 0) {
    throw new Error(`Uncaught page errors: ${problems.pageErrors.join(' | ')}`);
  }
}

/** Dev-server 502s on module requests come from Vite re-optimizing under load. */
export function apiFailures(problems: Problems) {
  return problems.badResponses.filter(
    (line) => line.includes('/trpc/') && !line.startsWith('502')
  );
}

export async function deleteProjectThroughSettings(
  page: Page,
  organizationId: string,
  projectId: string
) {
  await gotoHydrated(page, `/${organizationId}/${projectId}/settings`);
  await page.getByRole('button', { name: 'Delete Project' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^(Yes|Confirm|Delete)/ }).click();
  await page.getByText('Project is scheduled for deletion').waitFor();
}

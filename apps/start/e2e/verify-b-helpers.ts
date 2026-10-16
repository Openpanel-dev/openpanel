import type { Browser, Page } from '@playwright/test';

export const SHOTS_DIR = 'test-results/verify-b/shots';
export const API_URL = 'https://api.main.local.openpanel.cc';
export const DASHBOARD_URL = 'https://main.local.openpanel.cc';

export function shot(page: Page, name: string, fullPage = true) {
  return page.screenshot({ path: `${SHOTS_DIR}/${name}.png`, fullPage });
}

export interface Traffic {
  bad: string[];
  consoleErrors: string[];
  pageErrors: string[];
}

/** Records >= 400 API responses, console errors and uncaught exceptions. */
export function watch(page: Page): Traffic {
  const traffic: Traffic = { bad: [], consoleErrors: [], pageErrors: [] };
  page.on('response', (response) => {
    if (
      response.status() >= 400 &&
      !/favicon|sentry|api\.openpanel\.dev/.test(response.url())
    ) {
      const url = new URL(response.url());
      traffic.bad.push(`${response.status()} ${url.pathname}`);
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      traffic.consoleErrors.push(message.text().slice(0, 400));
    }
  });
  page.on('pageerror', (error) => {
    traffic.pageErrors.push(String(error).slice(0, 400));
  });
  return traffic;
}

export async function anonymousPage(browser: Browser) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    baseURL: DASHBOARD_URL,
    storageState: { cookies: [], origins: [] },
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  return { context, page, traffic: watch(page) };
}

/**
 * Opens a share by a client-side route change from an already hydrated page;
 * a direct document load of an enabled share does not answer on the dev stack.
 */
export async function openShareClientSide(page: Page, path: string) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.evaluate((target) => {
    window.history.pushState({}, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

export function trpcUrl(procedure: string, input: unknown) {
  return `${API_URL}/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
}

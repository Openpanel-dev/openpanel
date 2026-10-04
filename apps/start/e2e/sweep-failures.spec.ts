import { resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  attachRecorder,
  countSkeletons,
  inspectPage,
  OUTPUT_DIR,
  settle,
  writeJson,
} from './sweep-helpers';

// A click that cannot land should fail the step, not sit until the sweep-sized test timeout.
test.use({ actionTimeout: 20_000 });

const BASE = '/acme/acme-shop';
const SHOTS = resolve(OUTPUT_DIR, 'shots', 'failures');
// Three retries with exponential backoff (1s + 2s + 4s) before a query settles as failed.
const RETRIES_EXHAUSTED_MS = 12_000;
const HANG_OBSERVATION_MS = 15_000;

const sidebar = (page: Page) => page.locator('div.fixed.w-72');
const sidebarLink = (page: Page, name: string) =>
  sidebar(page).getByRole('link', { name, exact: true });

const failWith500 = (route: Route) =>
  route.fulfill({
    status: 500,
    contentType: 'application/json',
    body: JSON.stringify({
      error: {
        json: {
          message: 'E2E injected failure',
          code: -32_603,
          data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 },
        },
      },
    }),
  });

async function snapshot(page: Page, name: string) {
  await page.screenshot({ path: resolve(SHOTS, `${name}.png`) });
  const state = await inspectPage(page);
  return {
    name,
    url: page.url(),
    skeletons: await countSkeletons(page),
    textLength: state.textLength,
    suspicious: state.suspicious,
    text: await page.evaluate(() =>
      (document.querySelector('main')?.innerText ?? document.body.innerText)
        .replace(/\s+/g, ' ')
        .slice(0, 500)
    ),
  };
}

test.describe('failed and slow api calls', () => {
  test.setTimeout(8 * 60 * 1000);

  test('overview.stats answering 500 shows an error and recovers', async ({
    page,
  }) => {
    const recorder = attachRecorder(page);
    await page.goto(`${BASE}/sessions`);
    await settle(page);

    let calls = 0;
    await page.route('**/trpc/overview.stats*', (route) => {
      calls++;
      return failWith500(route);
    });
    await sidebarLink(page, 'Overview').click();
    await expect(page).toHaveURL(new RegExp(`${BASE}/?$`));
    await page.waitForTimeout(RETRIES_EXHAUSTED_MS);
    const failed = await snapshot(page, 'overview-stats-500');

    await page.unroute('**/trpc/overview.stats*');
    await sidebarLink(page, 'Sessions').click();
    await settle(page);
    await sidebarLink(page, 'Overview').click();
    await settle(page);
    const recovered = await snapshot(page, 'overview-stats-recovered');

    writeJson('failure-overview-stats-500.json', {
      calls,
      failed,
      recovered,
      ...recorder.snapshot(),
    });

    expect(recorder.pageErrors).toEqual([]);
    await expect(sidebarLink(page, 'Overview')).toBeVisible();
    expect(
      failed.skeletons,
      'stat cards must leave the loading state once retries are exhausted'
    ).toBe(0);
    expect(
      failed.text,
      'a failed stats call must not be presented as zero visitors'
    ).not.toMatch(/UNIQUE VISITORS 0 /i);
    await expect(
      page.getByRole('button', { name: /^Unique Visitors\s*[\d.,]+/ })
    ).toBeVisible();
  });

  test('overview.stats never answering leaves the rest of the page usable', async ({
    page,
  }) => {
    const recorder = attachRecorder(page);
    await page.goto(`${BASE}/sessions`);
    await settle(page);

    await page.route(
      '**/trpc/overview.stats*',
      () => new Promise(() => undefined)
    );
    await sidebarLink(page, 'Overview').click();
    await page.waitForTimeout(HANG_OBSERVATION_MS);
    const hanging = await snapshot(page, 'overview-stats-hanging');

    await sidebarLink(page, 'Sessions').click();
    await expect(page).toHaveURL(/\/sessions/);
    await settle(page);
    const afterLeaving = await snapshot(page, 'overview-stats-hanging-left');
    writeJson('failure-overview-stats-hang.json', {
      hanging,
      afterLeaving,
      ...recorder.snapshot(),
    });

    expect(recorder.pageErrors).toEqual([]);
    expect(hanging.textLength).toBeGreaterThan(200);
    await expect(
      page.locator(`a[href^="${BASE}/sessions/"]`).first()
    ).toBeVisible();
  });

  test('a failing session list shows an error inside the app shell', async ({
    page,
  }) => {
    const recorder = attachRecorder(page);
    await page.goto(BASE);
    await settle(page);

    await page.route('**/trpc/session.list*', failWith500);
    await sidebarLink(page, 'Sessions').click();
    await page.waitForTimeout(RETRIES_EXHAUSTED_MS);
    const failed = await snapshot(page, 'session-list-500');
    writeJson('failure-session-list.json', { failed, ...recorder.snapshot() });

    await expect(
      sidebarLink(page, 'Sessions'),
      'the sidebar survives a failed list call'
    ).toBeVisible();
    expect(failed.text).not.toMatch(/Cannot read properties/);
    expect(failed.text).toMatch(/error|failed|wrong|try again/i);

    await page.unroute('**/trpc/session.list*');
    await sidebarLink(page, 'Overview').click();
    await sidebarLink(page, 'Sessions').click();
    await expect(
      page.locator(`a[href^="${BASE}/sessions/"]`).first()
    ).toBeVisible();
  });

  test('a profile list that times out shows an error instead of an empty list', async ({
    page,
  }) => {
    const recorder = attachRecorder(page);
    await page.goto(BASE);
    await settle(page);

    await page.route('**/trpc/profile.list*', (route) =>
      route.abort('timedout')
    );
    await sidebarLink(page, 'Profiles').click();
    await page.waitForTimeout(RETRIES_EXHAUSTED_MS);
    const failed = await snapshot(page, 'profile-list-timeout');
    writeJson('failure-profile-list.json', { failed, ...recorder.snapshot() });

    await expect(sidebarLink(page, 'Profiles')).toBeVisible();
    expect(recorder.pageErrors).toEqual([]);
    expect(
      failed.skeletons,
      'profile list still loading after the call failed'
    ).toBe(0);
    expect(failed.text).toMatch(/error|failed|wrong|try again/i);

    await page.unroute('**/trpc/profile.list*');
    await sidebarLink(page, 'Overview').click();
    await sidebarLink(page, 'Profiles').click();
    await expect(
      page.locator(`a[href^="${BASE}/profiles/"]`).first()
    ).toBeVisible();
  });

  test('a failing mutation reports the error and keeps the form usable', async ({
    page,
  }) => {
    const recorder = attachRecorder(page);
    await page.goto(`${BASE}/settings/details`);
    await settle(page);

    // Every tRPC POST is answered locally, so nothing reaches the API and the seeded project is untouched.
    let intercepted = 0;
    await page.route('**/trpc/**', (route) => {
      if (route.request().method() !== 'POST') {
        return route.continue();
      }
      if (route.request().url().includes('auth.extendSession')) {
        return route.continue();
      }
      intercepted++;
      return failWith500(route);
    });

    const name = page.getByLabel('Name', { exact: true });
    const original = await name.inputValue();
    await name.fill(`${original} x`);
    await page.getByRole('button', { name: /save/i }).first().click();
    await page.waitForTimeout(2500);
    const afterSave = await snapshot(page, 'project-update-500');
    const toasts = await page.locator('[data-sonner-toast]').allInnerTexts();
    writeJson('failure-mutation.json', {
      intercepted,
      original,
      toasts,
      afterSave,
      ...recorder.snapshot(),
    });

    expect(intercepted).toBeGreaterThan(0);
    expect(recorder.pageErrors).toEqual([]);
    expect(toasts.join(' ')).toMatch(/E2E injected failure|error|wrong/i);
    await expect(name).toBeEditable();
    await expect(
      page.getByRole('button', { name: /save/i }).first()
    ).toBeEnabled();
  });
});

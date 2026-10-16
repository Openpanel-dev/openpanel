import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  attachRecorder,
  inspectPage,
  ORGANIZATION_ID,
  type Recorder,
  settle,
  type Visit,
  writeJson,
} from './sweep-helpers';

// A click that cannot land should fail the step, not sit until the sweep-sized test timeout.
test.use({ actionTimeout: 20_000 });

const NAV_TIMEOUT_MS = 15 * 60 * 1000;
const NAVIGATION_START_MS = 700;
const START_PROJECT = 'acme-shop';
const OTHER_PROJECT = { id: 'acme-web', name: 'Acme Web' };

const SIDEBAR_LINKS: { label: string; path: string }[] = [
  { label: 'Dashboards', path: '/dashboards' },
  { label: 'Insights', path: '/insights' },
  { label: 'Pages', path: '/pages' },
  { label: 'SEO', path: '/seo' },
  { label: 'Realtime', path: '/realtime' },
  { label: 'Events', path: '/events' },
  { label: 'Sessions', path: '/sessions' },
  { label: 'Profiles', path: '/profiles' },
  { label: 'Groups', path: '/groups' },
  { label: 'Cohorts', path: '/cohorts' },
  { label: 'Settings', path: '/settings' },
  { label: 'References', path: '/references' },
  { label: 'Notifications', path: '/notifications' },
  { label: 'Integrations', path: '/integrations' },
  { label: 'Overview', path: '' },
];

declare global {
  interface Window {
    sweepMarker?: boolean;
  }
}

const sidebar = (page: Page) => page.locator('div.fixed.w-72');

async function record(
  page: Page,
  recorder: Recorder,
  route: string,
  project: string,
  startedAt: number
): Promise<Visit> {
  // Queries start a tick after the click; settling at once would inspect the previous page.
  await page.waitForTimeout(NAVIGATION_START_MS);
  const wentIdle = await settle(page);
  const url = new URL(page.url());
  return {
    route,
    project,
    url: url.pathname + url.search,
    wentIdle,
    loadMs: Date.now() - startedAt,
    state: await inspectPage(page),
    ...recorder.snapshot(),
  };
}

test.describe('route sweep (client-side navigation)', () => {
  test.setTimeout(NAV_TIMEOUT_MS);

  test('sidebar links, tabs and detail rows navigate without a reload or crash', async ({
    page,
  }) => {
    const recorder = attachRecorder(page);
    const base = `/${ORGANIZATION_ID}/${START_PROJECT}`;
    await page.goto(base);
    await settle(page);
    await page.evaluate(() => {
      window.sweepMarker = true;
    });

    const results: Visit[] = [];
    for (const link of SIDEBAR_LINKS) {
      recorder.reset();
      const startedAt = Date.now();
      await sidebar(page)
        .getByRole('link', { name: link.label, exact: true })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`${base}${link.path}(/[a-z-]*)?(\\?.*)?$`)
      );
      results.push(
        await record(
          page,
          recorder,
          `sidebar:${link.label}`,
          START_PROJECT,
          startedAt
        )
      );

      const tabs = page.getByRole('tab');
      const tabCount = await tabs.count();
      for (let index = 0; index < tabCount; index++) {
        const tab = tabs.nth(index);
        const tabName = (await tab.innerText()).trim();
        recorder.reset();
        const tabStartedAt = Date.now();
        await tab.click();
        results.push(
          await record(
            page,
            recorder,
            `sidebar:${link.label} > tab:${tabName}`,
            START_PROJECT,
            tabStartedAt
          )
        );
      }
    }

    for (const kind of ['sessions', 'profiles']) {
      recorder.reset();
      await sidebar(page)
        .getByRole('link', {
          name: kind === 'sessions' ? 'Sessions' : 'Profiles',
          exact: true,
        })
        .click();
      const firstRow = page.locator(`a[href^="${base}/${kind}/"]`).first();
      await expect(firstRow).toBeVisible();
      const startedAt = Date.now();
      await firstRow.click();
      await expect(page).toHaveURL(new RegExp(`${base}/${kind}/.+`));
      results.push(
        await record(
          page,
          recorder,
          `row:${kind} detail`,
          START_PROJECT,
          startedAt
        )
      );
      recorder.reset();
      const backStartedAt = Date.now();
      await page.goBack();
      results.push(
        await record(
          page,
          recorder,
          `back from ${kind} detail`,
          START_PROJECT,
          backStartedAt
        )
      );
    }

    const survivedWithoutReload = await page.evaluate(
      () => window.sweepMarker === true
    );
    writeJson('client-nav.json', { survivedWithoutReload, results });

    expect(survivedWithoutReload).toBe(true);
    expect(
      results.filter(
        (result) => result.pageErrors?.length || result.state?.isBlank
      )
    ).toEqual([]);
  });

  test('switching project in the selector swaps every query to the new project', async ({
    page,
  }) => {
    const recorder = attachRecorder(page);
    const base = `/${ORGANIZATION_ID}/${START_PROJECT}`;
    await page.goto(`${base}/sessions`);
    await settle(page);

    const requestedProjects: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.includes('/trpc/')) {
        return;
      }
      const decoded = decodeURIComponent(url) + (request.postData() ?? '');
      for (const match of decoded.matchAll(/"projectId":"([^"]+)"/g)) {
        requestedProjects.push(match[1]);
      }
    });

    recorder.reset();
    await sidebar(page).getByRole('combobox').click();
    await page.getByRole('menuitem', { name: OTHER_PROJECT.name }).click();
    await expect(page).toHaveURL(
      new RegExp(`/${ORGANIZATION_ID}/${OTHER_PROJECT.id}`)
    );
    const idle = await settle(page);
    const state = await inspectPage(page);
    await page.screenshot({
      path: 'test-results/sweep/shots/client-nav/after-project-switch.png',
      fullPage: true,
    });

    writeJson('client-nav-project-switch.json', {
      url: page.url(),
      idle,
      state,
      requestedProjects: [...new Set(requestedProjects)],
      ...recorder.snapshot(),
    });

    await expect(sidebar(page).getByRole('combobox')).toContainText(
      OTHER_PROJECT.name
    );
    expect(requestedProjects).toContain(OTHER_PROJECT.id);
    expect(recorder.pageErrors).toEqual([]);

    // Stale data check: sessions list after the switch must link to the new project only.
    await sidebar(page)
      .getByRole('link', { name: 'Sessions', exact: true })
      .click();
    await expect(page.locator('a[href*="/sessions/"]').first()).toBeVisible();
    const hrefs = await page
      .locator('a[href*="/sessions/"]')
      .evaluateAll((links) =>
        links.map((link) => link.getAttribute('href') ?? '')
      );
    expect(hrefs.length).toBeGreaterThan(0);
    expect(
      hrefs.filter((href) => !href.includes(`/${OTHER_PROJECT.id}/`))
    ).toEqual([]);

    await sidebar(page)
      .getByRole('link', { name: 'Back to workspace', exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${ORGANIZATION_ID}/?$`));
    await page.goBack();
    await expect(page).toHaveURL(
      new RegExp(`/${ORGANIZATION_ID}/${OTHER_PROJECT.id}/sessions`)
    );
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/${ORGANIZATION_ID}/?$`));
  });
});

import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  attachRecorder,
  ORGANIZATION_ROUTES,
  OUTPUT_DIR,
  PROJECT_ROUTES,
  resolveProjectIds,
  resolveUrl,
  slug,
  type Visit,
  visit,
  visitClientSide,
  writeJson,
} from './sweep-helpers';

// A click that cannot land should fail the step, not sit until the sweep-sized test timeout.
test.use({ actionTimeout: 20_000 });

const PROJECT = 'acme-shop';
const AUTH_STATE_FILE = 'e2e/.auth/user.json';
const THEME_COOKIE = 'ui-theme';
const MAX_REPORTED_OVERFLOWS = 6;

const VARIANTS = [
  { name: 'mobile-light', width: 390, height: 844, theme: 'light' },
  { name: 'tablet-light', width: 768, height: 1024, theme: 'light' },
  { name: 'desktop-dark', width: 1280, height: 720, theme: 'dark' },
  { name: 'mobile-dark', width: 390, height: 844, theme: 'dark' },
] as const;

/** Elements that stick out of the viewport horizontally and are not inside a scroll container. */
function findOverflowingElements(page: Page, limit: number) {
  return page.evaluate((max) => {
    const viewportWidth = document.documentElement.clientWidth;
    const isInsideScroller = (element: Element) => {
      let parent = element.parentElement;
      while (parent && parent !== document.body) {
        const overflowX = getComputedStyle(parent).overflowX;
        if (
          overflowX === 'auto' ||
          overflowX === 'scroll' ||
          overflowX === 'hidden'
        ) {
          return true;
        }
        parent = parent.parentElement;
      }
      return false;
    };
    const found: string[] = [];
    for (const element of document.querySelectorAll('body *')) {
      const rect = element.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0;
      const sticksOut =
        rect.right > viewportWidth + 2 && rect.left < viewportWidth;
      if (!(isVisible && sticksOut) || isInsideScroller(element)) {
        continue;
      }
      const position = getComputedStyle(element).position;
      if (position === 'fixed') {
        continue;
      }
      const text = (element.textContent ?? '').trim().slice(0, 40);
      found.push(
        `<${element.tagName.toLowerCase()} class="${String(element.className).slice(0, 80)}"> right=${Math.round(rect.right)} "${text}"`
      );
      if (found.length >= max) {
        break;
      }
    }
    return found;
  }, limit);
}

for (const variant of VARIANTS) {
  test(`acme-shop routes render at ${variant.name} without a crash or page-level horizontal scroll`, async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(15 * 60 * 1000);
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      baseURL,
      storageState: AUTH_STATE_FILE,
      viewport: { width: variant.width, height: variant.height },
      colorScheme: variant.theme,
    });
    await context.addCookies([
      {
        name: THEME_COOKIE,
        value: variant.theme,
        domain: new URL(baseURL ?? '').hostname,
        path: '/',
      },
    ]);
    const page = await context.newPage();
    const recorder = attachRecorder(page);
    const ids = await resolveProjectIds(page.request, PROJECT);
    const shotDir = resolve(OUTPUT_DIR, 'shots', variant.name);

    const results: (Visit & { overflowing: string[]; htmlClass: string })[] =
      [];
    const specs = [
      ...PROJECT_ROUTES,
      ...ORGANIZATION_ROUTES.filter((spec) => spec.scope === 'organization'),
    ];
    for (const spec of specs) {
      const url = resolveUrl(spec, PROJECT, ids);
      if (!url) {
        continue;
      }
      const prefix = spec.scope === 'organization' ? 'org-' : '';
      // One document load per variant; the rest navigate client-side, which
      // keeps the viewport and theme and skips the dev server's module storm.
      const open = results.length === 0 ? visit : visitClientSide;
      const result = await open(
        page,
        recorder,
        { route: spec.route, project: PROJECT },
        url,
        resolve(shotDir, `${prefix}${slug(spec.route)}.png`)
      );
      results.push({
        ...result,
        overflowing: await findOverflowingElements(
          page,
          MAX_REPORTED_OVERFLOWS
        ),
        htmlClass: await page.evaluate(
          () => document.documentElement.className
        ),
      });
    }

    const isMobile = variant.width < 1024;
    let mobileNavigationWorks: boolean | null = null;
    if (isMobile) {
      await visitClientSide(
        page,
        recorder,
        { route: 'overview', project: PROJECT },
        `/acme/${PROJECT}`
      );
      const sidebar = page.locator('div.fixed.w-72');
      const sessionsLink = sidebar.getByRole('link', {
        name: 'Sessions',
        exact: true,
      });
      await expect(sessionsLink).not.toBeInViewport();
      await sidebar.locator('div.absolute.-right-12 button').click();
      await expect(sessionsLink).toBeInViewport();
      await page.waitForTimeout(400);
      await page.screenshot({
        path: resolve(shotDir, '_mobile-navigation-open.png'),
      });
      await sessionsLink.click();
      await expect(page).toHaveURL(/\/sessions/);
      await expect(sessionsLink).not.toBeInViewport();
      mobileNavigationWorks = true;
    }

    writeJson(`viewport-${variant.name}.json`, {
      mobileNavigationWorks,
      results,
    });
    await context.close();

    expect(
      results.every((result) =>
        result.htmlClass.split(' ').includes(variant.theme)
      ),
      'the theme cookie is applied on every page'
    ).toBe(true);
    expect(
      results
        .filter((result) => result.pageErrors?.length || result.state?.isBlank)
        .map((result) => result.url)
    ).toEqual([]);
    expect(
      results
        .filter((result) => (result.state?.horizontalOverflowPx ?? 0) > 2)
        .map(
          (result) => `${result.url} (+${result.state?.horizontalOverflowPx}px)`
        ),
      'pages that scroll horizontally as a whole'
    ).toEqual([]);
  });
}

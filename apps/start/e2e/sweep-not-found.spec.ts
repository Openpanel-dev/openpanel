import { resolve } from 'node:path';
import { expect, test } from './fixtures';
import {
  attachRecorder,
  OUTPUT_DIR,
  settle,
  slug,
  type Visit,
  visit,
  writeJson,
} from './sweep-helpers';

// A click that cannot land should fail the step, not sit until the sweep-sized test timeout.
test.use({ actionTimeout: 20_000 });

const UNKNOWN_ID = 'does-not-exist-e2e';
const PROJECT = '/acme/acme-shop';
const SPINNER_SELECTOR = '.animate-spin, .animate-pulse, [aria-busy="true"]';

const CASES: { name: string; url: string }[] = [
  { name: 'unknown organization', url: `/${UNKNOWN_ID}` },
  { name: 'unknown organization settings', url: `/${UNKNOWN_ID}/settings` },
  { name: 'unknown project', url: `/acme/${UNKNOWN_ID}` },
  { name: 'unknown project sessions', url: `/acme/${UNKNOWN_ID}/sessions` },
  { name: 'project of unknown organization', url: `/${UNKNOWN_ID}/acme-shop` },
  { name: 'unknown project page', url: `${PROJECT}/${UNKNOWN_ID}` },
  { name: 'unknown deep path', url: `/a/b/c/d/e/${UNKNOWN_ID}` },
  { name: 'unknown session', url: `${PROJECT}/sessions/${UNKNOWN_ID}` },
  { name: 'unknown profile', url: `${PROJECT}/profiles/${UNKNOWN_ID}` },
  {
    name: 'unknown profile events',
    url: `${PROJECT}/profiles/${UNKNOWN_ID}/events`,
  },
  { name: 'unknown dashboard', url: `${PROJECT}/dashboards/${UNKNOWN_ID}` },
  { name: 'unknown report', url: `${PROJECT}/reports/${UNKNOWN_ID}` },
  { name: 'unknown cohort', url: `${PROJECT}/cohorts/${UNKNOWN_ID}` },
  { name: 'unknown group', url: `${PROJECT}/groups/${UNKNOWN_ID}` },
  { name: 'unknown settings tab', url: `${PROJECT}/settings/${UNKNOWN_ID}` },
  {
    name: 'malformed search params',
    url: `${PROJECT}/sessions?filters=%7Bbroken&cursor=abc`,
  },
  {
    name: 'malformed overview range',
    url: `${PROJECT}?range=nonsense&startDate=not-a-date&endDate=x&interval=zzz`,
  },
  { name: 'double slash', url: '/acme//acme-shop' },
  { name: 'unknown overview share', url: `/share/overview/${UNKNOWN_ID}` },
  { name: 'unknown dashboard share', url: `/share/dashboard/${UNKNOWN_ID}` },
  { name: 'unknown report share', url: `/share/report/${UNKNOWN_ID}` },
  {
    name: 'widget counter unknown share',
    url: `/widget/counter?shareId=${UNKNOWN_ID}`,
  },
  {
    name: 'widget realtime unknown share',
    url: `/widget/realtime?shareId=${UNKNOWN_ID}`,
  },
  {
    name: 'widget badge unknown share',
    url: `/widget/badge?shareId=${UNKNOWN_ID}`,
  },
  { name: 'widget realtime without share id', url: '/widget/realtime' },
  {
    name: 'onboarding unknown project',
    url: `/onboarding/${UNKNOWN_ID}/connect`,
  },
  { name: 'verify without params', url: '/verify' },
];

test.describe('not-found and access handling', () => {
  test.setTimeout(10 * 60 * 1000);

  test('unknown ids and malformed urls end in a not-found, error page or redirect', async ({
    page,
  }) => {
    const recorder = attachRecorder(page);
    const results: (Visit & {
      name: string;
      spinners: number;
      text: string;
    })[] = [];
    for (const item of CASES) {
      const result = await visit(
        page,
        recorder,
        { route: item.name, project: '-' },
        item.url,
        resolve(OUTPUT_DIR, 'shots', 'not-found', `${slug(item.name)}.png`)
      );
      const spinners = await page
        .locator(SPINNER_SELECTOR)
        .count()
        .catch(() => -1);
      const text = await page
        .evaluate(() =>
          document.body.innerText.replace(/\s+/g, ' ').slice(0, 300)
        )
        .catch(() => '');
      results.push({ ...result, name: item.name, spinners, text });
    }
    writeJson('not-found.json', results);

    const broken = results
      .filter(
        (result) =>
          result.navigationError ||
          (result.status ?? 0) >= 500 ||
          result.pageErrors?.length ||
          result.state?.isBlank
      )
      .map(({ name, url, status, pageErrors, navigationError }) => ({
        name,
        url,
        status,
        pageErrors,
        navigationError,
      }));
    expect(broken).toEqual([]);
  });

  test('the escape buttons on not-found and error pages lead home', async ({
    page,
  }) => {
    const outcomes: Record<string, { href: string | null; landedOn: string }> =
      {};
    const cases = [
      { url: `/${UNKNOWN_ID}`, button: 'Go to home' },
      { url: `${PROJECT}/sessions/${UNKNOWN_ID}`, button: 'Go back to home' },
      { url: `/acme/${UNKNOWN_ID}`, button: 'Go back to home' },
    ];
    for (const item of cases) {
      await page.goto(item.url);
      await settle(page);
      const link = page.getByRole('link', { name: item.button });
      await expect(link).toBeVisible();
      const href = await link.getAttribute('href');
      await link.click();
      await page.waitForTimeout(2500);
      outcomes[item.url] = { href, landedOn: new URL(page.url()).pathname };
    }
    writeJson('not-found-escape-buttons.json', outcomes);
    for (const [url, outcome] of Object.entries(outcomes)) {
      expect(outcome.landedOn, `"home" button on ${url}`).toBe('/acme');
    }
  });

  test('a malformed percent-encoded path gets an http answer, not a dropped connection', async ({
    page,
  }) => {
    const response = await page
      .goto(`${PROJECT}/profiles/%E0%A4%A`)
      .catch((error: Error) => error);
    const outcome =
      response instanceof Error
        ? response.message.split('\n')[0]
        : `status ${response?.status()}`;
    writeJson('not-found-malformed-path.json', { outcome });
    expect(outcome).toMatch(/^status (400|404)$/);
  });

  test('a signed-out visitor is sent to the login page', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    const outcomes: Record<string, string> = {};
    for (const url of [
      '/acme/acme-shop',
      '/acme',
      '/acme/acme-shop/sessions',
      '/',
    ]) {
      await page.goto(url);
      await page.waitForLoadState('networkidle').catch(() => undefined);
      outcomes[url] = new URL(page.url()).pathname;
    }
    writeJson('not-found-signed-out.json', outcomes);
    await context.close();
    for (const [url, finalPath] of Object.entries(outcomes)) {
      expect(finalPath, `signed-out visit to ${url}`).toMatch(/^\/login/);
    }
  });
});

import { resolve } from 'node:path';
import { expect, test } from './fixtures';
import {
  attachRecorder,
  countSkeletons,
  OUTPUT_DIR,
  settle,
  slug,
  writeJson,
} from './sweep-helpers';

const AUTH_STATE_FILE = 'e2e/.auth/user.json';
const PROJECT = '/acme/acme-shop';
const MAIN_PAGES = [
  '/acme',
  '/acme/settings',
  PROJECT,
  `${PROJECT}/pages`,
  `${PROJECT}/events`,
  `${PROJECT}/sessions`,
  `${PROJECT}/profiles`,
  `${PROJECT}/realtime`,
  `${PROJECT}/dashboards`,
  `${PROJECT}/settings/details`,
  `${PROJECT}/settings/clients`,
  `${PROJECT}/events/stats`,
  `${PROJECT}/profiles/eff0e0780de4d2acfc1756f492f206b0`,
  `${PROJECT}/sessions/mTLtFVNQBmFLDSb4Fdt3vg`,
];

const textLines = (text: string) =>
  new Set(
    text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  );

test('server-rendered html matches what hydration expects on the main pages', async ({
  browser,
  page,
  baseURL,
}) => {
  test.setTimeout(20 * 60 * 1000);
  const serverOnly = await browser.newContext({
    ignoreHTTPSErrors: true,
    baseURL,
    storageState: AUTH_STATE_FILE,
    javaScriptEnabled: false,
  });
  const serverPage = await serverOnly.newPage();
  const recorder = attachRecorder(page);

  const report: Record<string, unknown>[] = [];
  for (const url of MAIN_PAGES) {
    const response = await serverPage.goto(url, { waitUntil: 'load' });
    const serverText = await serverPage.evaluate(() => document.body.innerText);
    const serverSkeletons = await serverPage.locator('.animate-pulse').count();
    await serverPage.screenshot({
      path: resolve(OUTPUT_DIR, 'shots', 'ssr', `${slug(url)}-server.png`),
      fullPage: true,
    });

    recorder.reset();
    await page.goto(url, { waitUntil: 'load' });
    await settle(page);
    const clientText = await page.evaluate(() => document.body.innerText);
    await page.screenshot({
      path: resolve(OUTPUT_DIR, 'shots', 'ssr', `${slug(url)}-hydrated.png`),
      fullPage: true,
    });

    const serverLines = textLines(serverText);
    const clientLines = textLines(clientText);
    report.push({
      url,
      status: response?.status(),
      serverTextLength: serverText.trim().length,
      clientTextLength: clientText.trim().length,
      serverSkeletons,
      clientSkeletons: await countSkeletons(page),
      onlyInServerHtml: [...serverLines]
        .filter((line) => !clientLines.has(line))
        .slice(0, 40),
      onlyAfterHydration: [...clientLines]
        .filter((line) => !serverLines.has(line))
        .slice(0, 40),
      hydrationErrors: [
        ...recorder.consoleErrors,
        ...recorder.pageErrors,
      ].filter((text) => /hydrat|did not match|didn't match/i.test(text)),
      pageErrors: recorder.pageErrors,
    });
  }
  await serverOnly.close();
  writeJson('ssr.json', report);

  expect(
    report
      .filter((entry) => (entry.hydrationErrors as string[]).length > 0)
      .map((entry) => entry.url),
    'pages with a React hydration mismatch'
  ).toEqual([]);
});

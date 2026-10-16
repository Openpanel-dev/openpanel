import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const ROUTE = '/acme/acme-web/dashboards';
const PREAMBLE =
  /<script type="module" async="">import \{ injectIntoGlobalHook \}[\s\S]*?<\/script>/;

function hydrationWarnings(page: Page) {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.text().includes('hydrated but some attributes')) {
      warnings.push(message.text().slice(0, 80));
    }
  });
  return warnings;
}

test('a document load hydrates without an attribute mismatch', async ({
  page,
}) => {
  const warnings = hydrationWarnings(page);
  await page.goto(ROUTE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  expect(warnings).toEqual([]);
});

// The mismatch is the dev server's React Refresh preamble, which <Scripts />
// renders into <body> on the server only: the next <script> in the root
// document hydrates against it. With the preamble out of <body> it is gone.
test('the mismatch disappears when the React Refresh preamble is not in <body>', async ({
  page,
}) => {
  const warnings = hydrationWarnings(page);
  let preambleInBody = false;
  await page.route(`**${ROUTE}`, async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    const preamble = html.match(PREAMBLE)?.[0];
    preambleInBody = Boolean(preamble);
    await route.fulfill({
      response,
      body: preamble
        ? html.replace(preamble, '').replace('</head>', `${preamble}</head>`)
        : html,
    });
  });
  await page.goto(ROUTE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  test.skip(!preambleInBody, 'not a dev server: no preamble to move');
  expect(warnings).toEqual([]);
});

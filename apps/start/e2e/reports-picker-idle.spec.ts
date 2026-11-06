import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  addEvent,
  hideFeedbackPrompt,
  openSidebar,
  pickChartType,
} from './reports-helpers';

const SHOP = 'acme-shop';
const LIST_SELECTOR = '.rc-virtual-list-holder';
const SETTLE_MS = 1500;
const IDLE_WINDOW_MS = 3000;
// A looping list commits once per frame, 30+ times in the window even at
// headless Chromium's frame rate; a settled one commits once at most.
const MAX_IDLE_COMMITS = 5;

declare global {
  interface Window {
    __reactCommits: number;
  }
}

// React reports every commit to this hook, so the count needs no app code.
async function countReactCommits(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__reactCommits = 0;
    Object.assign(window, {
      __REACT_DEVTOOLS_GLOBAL_HOOK__: {
        renderers: new Map(),
        supportsFiber: true,
        checkDCE: () => undefined,
        inject: () => 1,
        onCommitFiberRoot: () => {
          window.__reactCommits += 1;
        },
        onCommitFiberUnmount: () => undefined,
        onPostCommitFiberRoot: () => undefined,
        onScheduleFiberRoot: () => undefined,
        setStrictMode: () => undefined,
      },
    });
  });
}

async function commitsWhileIdle(page: Page): Promise<number> {
  await page.locator(LIST_SELECTOR).waitFor();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(SETTLE_MS);
  const before = await page.evaluate(() => window.__reactCommits);
  // Zero would mean the hook never fired, and every idle check would pass.
  expect(before).toBeGreaterThan(0);
  await page.waitForTimeout(IDLE_WINDOW_MS);
  const after = await page.evaluate(() => window.__reactCommits);
  return after - before;
}

test.use({ actionTimeout: 20_000 });

test.beforeEach(async ({ page }) => {
  await hideFeedbackPrompt(page);
  await countReactCommits(page);
  await page.goto(`/acme/${SHOP}/reports`);
  await page.waitForLoadState('networkidle');
});

test('an open event picker stays idle and still searches and selects', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const sheet = await openSidebar(page);
  await sheet.getByRole('combobox').filter({ hasText: 'Select event' }).click();

  expect(await commitsWhileIdle(page)).toBeLessThanOrEqual(MAX_IDLE_COMMITS);

  const nonMatching = page
    .getByRole('option')
    .filter({ hasText: /^screen_view\d/ });
  const matching = page
    .getByRole('option')
    .filter({ hasText: /^add_to_cart\d/ });
  await expect(nonMatching).toBeVisible();
  await page.getByPlaceholder('Search event...').fill('add_to_cart');
  await expect(nonMatching).toHaveCount(0);
  await expect(matching).toBeVisible();

  expect(await commitsWhileIdle(page)).toBeLessThanOrEqual(MAX_IDLE_COMMITS);

  await matching.click();
  await expect(sheet.getByRole('combobox').first()).toHaveText('add_to_cart');
});

test('an open retention criteria picker stays idle and still selects', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await addEvent(page, 'add_to_cart');
  const sheet = await openSidebar(page);
  await sheet.getByRole('button', { name: 'Done' }).click();
  await sheet.waitFor({ state: 'hidden' });
  await pickChartType(page, 'Linear', 'Retention');
  await page.getByRole('button', { name: /add_to_cart/ }).click();
  const criteria = sheet
    .getByRole('combobox')
    .filter({ hasText: 'On or After' });
  await criteria.click();

  expect(await commitsWhileIdle(page)).toBeLessThanOrEqual(MAX_IDLE_COMMITS);

  await page.getByRole('option', { name: 'On', exact: true }).click();
  await expect(sheet.getByRole('combobox').nth(2)).toHaveText('On');
});

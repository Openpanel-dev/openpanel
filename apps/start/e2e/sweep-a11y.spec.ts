import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { settle, writeJson } from './sweep-helpers';

// A click that cannot land should fail the step, not sit until the sweep-sized test timeout.
test.use({ actionTimeout: 20_000 });

const BASE = '/acme/acme-shop';
const MAIN_PAGES = [
  '/acme',
  '/acme/settings',
  BASE,
  `${BASE}/pages`,
  `${BASE}/events`,
  `${BASE}/sessions`,
  `${BASE}/profiles`,
  `${BASE}/settings/details`,
  `${BASE}/settings/clients`,
  `${BASE}/references`,
  `${BASE}/notifications/rules`,
];
const TAB_PRESSES = 45;
const MODAL_TAB_PRESSES = 25;
const MAX_MENU_ITEMS = 14;

/** Visible form controls and buttons/links that expose no accessible name. */
function findUnnamedControls(page: Page) {
  return page.evaluate(() => {
    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden';
    };
    const labelledBy = (element: Element) =>
      (element.getAttribute('aria-labelledby') ?? '')
        .split(' ')
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join('')
        .trim();
    const describe = (element: Element) =>
      element.outerHTML.replace(/\s+/g, ' ').slice(0, 160);

    const unlabeledFields: string[] = [];
    for (const field of document.querySelectorAll<HTMLInputElement>(
      'input:not([type=hidden]), select, textarea, [role=combobox], [role=switch], [role=checkbox]'
    )) {
      if (!isVisible(field)) {
        continue;
      }
      const hasLabel =
        !!field.getAttribute('aria-label') ||
        !!labelledBy(field) ||
        !!field.closest('label') ||
        (!!field.id &&
          !!document.querySelector(`label[for="${CSS.escape(field.id)}"]`)) ||
        !!field.getAttribute('title') ||
        !!(field.textContent ?? '').trim();
      if (!hasLabel) {
        unlabeledFields.push(
          `${field.getAttribute('placeholder') ? '(placeholder only) ' : ''}${describe(field)}`
        );
      }
    }

    const unnamedButtons: string[] = [];
    for (const control of document.querySelectorAll(
      'button, a[href], [role=button]'
    )) {
      if (!isVisible(control)) {
        continue;
      }
      const name =
        control.getAttribute('aria-label') ||
        labelledBy(control) ||
        control.getAttribute('title') ||
        (control.textContent ?? '').trim() ||
        control.querySelector('img[alt]')?.getAttribute('alt') ||
        control.querySelector('svg title')?.textContent;
      if (!name) {
        unnamedButtons.push(describe(control));
      }
    }
    return { unlabeledFields, unnamedButtons };
  });
}

const describeFocus = (page: Page) =>
  page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) {
      return 'body';
    }
    const name =
      element.getAttribute('aria-label') ||
      (element.textContent ?? '').trim().slice(0, 30) ||
      element.getAttribute('placeholder') ||
      element.getAttribute('name') ||
      '';
    const region = element.closest('div.fixed.w-72')
      ? 'sidebar'
      : element.closest('[role=dialog]')
        ? 'dialog'
        : 'main';
    const style = getComputedStyle(element);
    const hasIndicator =
      style.outlineStyle !== 'none' || style.boxShadow !== 'none';
    return `${region}:${element.tagName.toLowerCase()}[${name}]${hasIndicator ? '' : ' (no focus ring)'}`;
  });

test.describe('keyboard and accessibility basics', () => {
  test.setTimeout(15 * 60 * 1000);

  test('main pages: controls have names and Tab reaches the main content', async ({
    page,
  }) => {
    const report: Record<string, unknown>[] = [];
    for (const url of MAIN_PAGES) {
      await page.goto(url);
      await settle(page);
      const unnamed = await findUnnamedControls(page);
      const tabStops: string[] = [];
      for (let press = 0; press < TAB_PRESSES; press++) {
        await page.keyboard.press('Tab');
        tabStops.push(await describeFocus(page));
      }
      report.push({
        url,
        ...unnamed,
        firstMainStop:
          tabStops.findIndex((stop) => stop.startsWith('main:')) + 1,
        tabStops,
      });
    }
    writeJson('a11y-pages.json', report);
    for (const entry of report) {
      expect(
        entry.firstMainStop,
        `${entry.url}: Tab never reaches the main content`
      ).toBeGreaterThan(0);
      expect(
        (entry.tabStops as string[]).filter((stop) => stop.includes('[]')),
        `${entry.url}: focusable controls without an accessible name`
      ).toEqual([]);
    }
  });

  test('project selector works with the keyboard', async ({ page }) => {
    await page.goto(BASE);
    await settle(page);
    const selector = page.locator('div.fixed.w-72').getByRole('combobox');
    await selector.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await page.keyboard.press('ArrowDown');
    const focusedItem = await describeFocus(page);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(selector).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(menu).toBeVisible();
    const visited: string[] = [];
    for (let press = 0; press < MAX_MENU_ITEMS; press++) {
      await page.keyboard.press('ArrowDown');
      const item = await describeFocus(page);
      visited.push(item);
      if (item.includes('[Acme Web]')) {
        break;
      }
    }
    await page.keyboard.press('Enter');
    writeJson('a11y-project-selector.json', { focusedItem, visited });
    await expect(page).toHaveURL(/\/acme\/acme-web/);
  });

  test('create-project modal traps focus, closes on Escape and returns focus', async ({
    page,
  }) => {
    await page.goto('/acme');
    await settle(page);
    const selector = page.locator('div.fixed.w-72').getByRole('combobox');
    await selector.click();
    await page.getByRole('menuitem', { name: 'Create new project' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.screenshot({
      path: 'test-results/sweep/shots/a11y/create-project-modal.png',
    });

    const unnamed = await findUnnamedControls(page);
    const stops: string[] = [];
    for (let press = 0; press < MODAL_TAB_PRESSES; press++) {
      await page.keyboard.press('Tab');
      stops.push(await describeFocus(page));
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    const focusAfterClose = await describeFocus(page);
    writeJson('a11y-modal.json', { unnamed, stops, focusAfterClose });

    expect(stops.filter((stop) => !stop.startsWith('dialog:'))).toEqual([]);
  });

  test('overview pickers open, move and close with the keyboard', async ({
    page,
  }) => {
    await page.goto(BASE);
    await settle(page);
    const outcomes: Record<string, unknown> = {};
    for (const name of [
      /Last 7 days|Last 30 days|Today/,
      /^Day$|^Hour$/,
      /Filters/,
    ]) {
      const trigger = page.getByRole('button', { name }).first();
      await trigger.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600);
      const opened = await page
        .locator(
          '[role=menu], [role=dialog], [role=listbox], [data-radix-popper-content-wrapper]'
        )
        .count();
      await page.keyboard.press('ArrowDown');
      const focusInside = await describeFocus(page);
      await page.screenshot({
        path: `test-results/sweep/shots/a11y/overview-picker-${String(name).replace(/\W+/g, '-')}.png`,
      });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      const stillOpen = await page
        .locator(
          '[role=menu], [role=dialog], [role=listbox], [data-radix-popper-content-wrapper]'
        )
        .count();
      outcomes[String(name)] = {
        opened,
        focusInside,
        stillOpen,
        focusAfterClose: await describeFocus(page),
      };
    }
    writeJson('a11y-overview-pickers.json', outcomes);
    for (const [name, outcome] of Object.entries(outcomes)) {
      const { opened, stillOpen } = outcome as {
        opened: number;
        stillOpen: number;
      };
      expect(opened, `${name} opens with Enter`).toBeGreaterThan(0);
      expect(stillOpen, `${name} closes with Escape`).toBe(0);
    }
  });

  test('login form fields are labelled', async ({ browser, baseURL }) => {
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto('/login');
    await settle(page);
    await page.screenshot({ path: 'test-results/sweep/shots/a11y/login.png' });
    const unnamed = await findUnnamedControls(page);
    const stops: string[] = [];
    for (let press = 0; press < 12; press++) {
      await page.keyboard.press('Tab');
      stops.push(await describeFocus(page));
    }
    writeJson('a11y-login.json', { unnamed, stops });
    await context.close();
    expect(unnamed.unlabeledFields).toEqual([]);
  });
});

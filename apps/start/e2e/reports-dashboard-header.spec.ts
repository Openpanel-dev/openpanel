import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  createDashboard,
  createReport,
  deleteDashboard,
  eventSeries,
  hideFeedbackPrompt,
  reportInput,
  shot,
} from './reports-helpers';

const PROJECT = 'acme-app';
const LIST_URL = `/acme/${PROJECT}/dashboards`;
const DESKTOP = { width: 1440, height: 900 };
const TABLET_WIDTH = 820;
const OTHER_WIDTHS = [1280, 1024, TABLET_WIDTH, 390];
const MAX_MISALIGNMENT_PX = 1;

async function verticalCenter(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('The control is not visible');
  }
  return box.y + box.height / 2;
}

function headerControls(page: Page): Locator[] {
  return [
    page.getByPlaceholder('Search reports...'),
    page.getByRole('button', { name: /^Last \d+ days$/ }),
    page.getByRole('button', { name: 'Previous period' }),
    page.getByRole('button', { name: 'Next period' }),
    page.getByRole('button', { name: /^Interval:/ }),
    page.getByRole('link', { name: 'Create report' }),
    page.getByRole('button', { name: 'Dashboard actions' }),
  ];
}

/** Retried, because hydration can replace the controls while they are measured. */
async function expectOnOneLine(page: Page): Promise<void> {
  await expect(async () => {
    const [search, ...others] = headerControls(page);
    const searchCenter = await verticalCenter(search as Locator);
    for (const control of others) {
      const offset = Math.abs((await verticalCenter(control)) - searchCenter);
      expect(offset, `${control}`).toBeLessThanOrEqual(MAX_MISALIGNMENT_PX);
    }
  }).toPass({ timeout: 15_000 });
}

test('dashboard header controls sit on one line', async ({ page }) => {
  test.setTimeout(120_000);
  await hideFeedbackPrompt(page);
  await page.setViewportSize(DESKTOP);
  await page.goto(LIST_URL);
  const dashboard = await createDashboard(page, PROJECT, 'header');
  try {
    await createReport(
      page,
      dashboard.id,
      'E2E reports opens',
      reportInput(PROJECT, { series: eventSeries(['app_opened']) })
    );
    await page.goto(`${LIST_URL}/${dashboard.id}`);
    const search = page.getByPlaceholder('Search reports...');
    await expect(search).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    await shot(page, 'dash-header-desktop');

    await expectOnOneLine(page);
    const searchCenter = await verticalCenter(search);
    const icon = page.locator('div:has(> input[type="search"]) > svg');
    const iconOffset = Math.abs((await verticalCenter(icon)) - searchCenter);
    expect(iconOffset, 'search icon').toBeLessThanOrEqual(MAX_MISALIGNMENT_PX);

    for (const width of OTHER_WIDTHS) {
      await page.setViewportSize({ width, height: DESKTOP.height });
      // A fresh load, so the sidebar is not caught sliding to its new place.
      await page.reload();
      await expect(search).toBeVisible({ timeout: 30_000 });
      await page.waitForLoadState('networkidle');
      await shot(page, `dash-header-${width}`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow, `${width}px wide`).toBeLessThanOrEqual(1);
      if (width >= TABLET_WIDTH) {
        await expectOnOneLine(page);
      }
    }
  } finally {
    await deleteDashboard(page, dashboard.id);
  }
});

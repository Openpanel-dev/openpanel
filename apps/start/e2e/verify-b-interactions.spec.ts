import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  eventSeries,
  hideFeedbackPrompt,
  reportInput,
  trpcMutation,
  trpcQuery,
  waitForChart,
} from './reports-helpers';
import { shot, watch } from './verify-b-helpers';

const SHOP = 'acme-shop';

async function createDashboard(page: Page, label: string) {
  return trpcMutation<{ id: string }>(page, 'dashboard.create', {
    name: `E2E verify-b ${label} ${Date.now()}`,
    projectId: SHOP,
  });
}

async function createReport(
  page: Page,
  dashboardId: string,
  name: string,
  overrides: Record<string, unknown>
) {
  const { projectId: _projectId, ...report } = reportInput(SHOP, overrides);
  return trpcMutation<{ id: string }>(page, 'report.create', {
    dashboardId,
    report: { ...report, name },
  });
}

function deleteDashboard(page: Page, id: string) {
  return trpcMutation(page, 'dashboard.delete', { id, forceDelete: true });
}

/** The report table is a virtualised div grid: one checkbox per series row. */
function tableRows(editor: Locator) {
  return editor.getByRole('checkbox').evaluateAll((boxes) =>
    boxes.map((box) => {
      let row: HTMLElement | null = box as HTMLElement;
      while (row && row.innerText.split('\n').filter(Boolean).length < 5) {
        row = row.parentElement;
      }
      const cells = (row?.innerText ?? '').split('\n').filter(Boolean);
      return {
        checked: box.getAttribute('data-state') === 'checked',
        serie: cells[0] ?? '',
        device: cells[1] ?? '',
        sum: Number(cells[3]),
      };
    })
  );
}

const drawnLines = (editor: Locator) =>
  editor.locator('path.recharts-line-curve').count();

test.use({ actionTimeout: 15_000 });

test.beforeEach(async ({ page }) => {
  test.setTimeout(240_000);
  await hideFeedbackPrompt(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/login');
});

test('report page: view users from a chart point, series toggles, sorting, search', async ({
  page,
}) => {
  const traffic = watch(page);
  const dashboard = await createDashboard(page, 'interactions');
  try {
    const series = eventSeries(['purchase', 'add_to_cart']);
    const report = await createReport(
      page,
      dashboard.id,
      'E2E verify-b interactions',
      {
        series,
        breakdowns: [{ id: 'b', name: 'device' }],
      }
    );
    await page.goto(`/acme/${SHOP}/reports/${report.id}`);
    await page.waitForLoadState('networkidle');
    await waitForChart(page);
    const editor = page.locator('#report-editor');

    // --- view users from a chart point
    const surface = editor.locator('svg.recharts-surface').first();
    const box = await surface.boundingBox();
    if (!box) {
      throw new Error('chart not drawn');
    }
    const profilesAnswer = page.waitForResponse((response) =>
      response.url().includes('/trpc/chart.getProfiles')
    );
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * 0.5);
    await page.getByRole('menuitem', { name: 'View Users' }).click();
    const profilesResponse = await profilesAnswer;
    expect(profilesResponse.status()).toBe(200);
    const profiles = (await profilesResponse.json()).result.data.json as {
      id: string;
    }[];
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('View Users')).toBeVisible();
    await expect(
      dialog.getByText(/Users who performed actions on/)
    ).toBeVisible();
    expect(profiles.length).toBeGreaterThan(0);
    await expect(dialog.locator('a[href*="/profiles/"]').first()).toBeVisible();
    await shot(page, 'item13-view-users', false);
    const firstHref = await dialog
      .locator('a[href*="/profiles/"]')
      .first()
      .getAttribute('href');
    expect(firstHref).toContain(`/acme/${SHOP}/profiles/`);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // --- series toggles (the chart legend itself is not interactive)
    const before = await tableRows(editor);
    const checkedBefore = before.filter((row) => row.checked).length;
    // Each visible series draws one curve; the chart adds one helper curve.
    await expect.poll(() => drawnLines(editor)).toBe(checkedBefore + 1);
    await editor.getByRole('checkbox').first().click();
    await expect.poll(() => drawnLines(editor)).toBe(checkedBefore);
    await editor.getByRole('checkbox').first().click();
    await expect.poll(() => drawnLines(editor)).toBe(checkedBefore + 1);
    await editor.getByRole('button', { name: 'Unselect All' }).click();
    await expect.poll(() => drawnLines(editor)).toBe(0);
    await shot(page, 'item13-unselect-all');
    expect((await tableRows(editor)).filter((row) => row.checked)).toEqual([]);
    for (const index of [0, 1]) {
      await editor.getByRole('checkbox').nth(index).click();
    }
    await expect.poll(() => drawnLines(editor)).toBe(3);

    // --- sorting on Sum, in the default flat view
    const sumHeader = editor.getByRole('button', { name: /^Sum/i }).first();
    const sortedSums: number[][] = [];
    for (let click = 0; click < 2; click++) {
      await sumHeader.click();
      await page.waitForTimeout(400);
      sortedSums.push((await tableRows(editor)).map((row) => row.sum));
    }
    await shot(page, 'item13-sorted');
    const ascending = [...(sortedSums[0] ?? [])].sort((a, b) => a - b);
    const descending = [...ascending].reverse();
    const orders = sortedSums.map((sums) => JSON.stringify(sums));
    expect(orders).toContain(JSON.stringify(ascending));
    expect(orders).toContain(JSON.stringify(descending));

    // --- sums match the API
    const api = await trpcQuery<{
      series: { names: string[]; metrics: { sum: number } }[];
    }>(page, 'chart.chart', {
      ...reportInput(SHOP, {
        series,
        breakdowns: [{ id: 'b', name: 'device' }],
      }),
    });
    expect([...(sortedSums[0] ?? [])].sort((a, b) => a - b)).toEqual(
      api.series.map((serie) => serie.metrics.sum).sort((a, b) => a - b)
    );

    // --- grouped view folds the rows under their series
    await editor.getByRole('button', { name: 'Flat', exact: true }).click();
    await expect(
      editor.getByRole('button', { name: 'Grouped', exact: true })
    ).toBeVisible();
    await shot(page, 'item13-grouped');
    await editor.getByRole('button', { name: 'Grouped', exact: true }).click();

    // --- search narrows the rows
    await editor.getByPlaceholder('Search...').fill('tablet');
    await expect
      .poll(async () => (await tableRows(editor)).map((row) => row.device))
      .toEqual(['tablet', 'tablet']);

    expect(traffic.bad).toEqual([]);
    expect(traffic.pageErrors).toEqual([]);
  } finally {
    await deleteDashboard(page, dashboard.id);
  }
});

test('dashboard grid: drag, resize, persist, reset layout', async ({
  page,
}) => {
  const traffic = watch(page);
  const dashboard = await createDashboard(page, 'grid');
  try {
    for (const name of ['E2E verify-b grid one', 'E2E verify-b grid two']) {
      await createReport(page, dashboard.id, name, {
        series: eventSeries(['purchase']),
      });
    }
    await page.goto(`/acme/${SHOP}/dashboards/${dashboard.id}`);
    await page.waitForLoadState('networkidle');
    const card = (name: string) =>
      page.locator('.react-grid-item').filter({ hasText: name });
    const one = card('E2E verify-b grid one');
    const two = card('E2E verify-b grid two');
    await expect(one).toBeVisible({ timeout: 30_000 });
    const boxes = async () => ({
      one: await one.boundingBox(),
      two: await two.boundingBox(),
    });
    const initial = await boxes();
    await shot(page, 'item13-grid-initial');

    // --- resize card one from its bottom-right handle
    const layoutSaved = () =>
      page.waitForResponse((response) =>
        response.url().includes('/trpc/report.updateLayout')
      );
    const handle = one.locator('.react-resizable-handle').last();
    const handleBox = await handle.boundingBox();
    if (!(handleBox && initial.one && initial.two)) {
      throw new Error('grid not laid out');
    }
    let saved = layoutSaved();
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(handleBox.x + 40, handleBox.y + 160, { steps: 12 });
    await page.mouse.up();
    expect((await saved).status()).toBe(200);
    await page.waitForTimeout(800);
    const resized = await boxes();
    expect(resized.one?.height ?? 0).toBeGreaterThan(initial.one.height + 80);

    // --- drag card two by its handle to the left column
    const grip = two.locator('.drag-handle').first();
    const gripBox = await grip.boundingBox();
    if (!gripBox) {
      throw new Error('no drag handle');
    }
    saved = layoutSaved();
    await page.mouse.move(
      gripBox.x + gripBox.width / 2,
      gripBox.y + gripBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(gripBox.x - 300, gripBox.y + 500, { steps: 20 });
    await page.mouse.up();
    expect((await saved).status()).toBe(200);
    await page.waitForTimeout(800);
    const dragged = await boxes();
    await shot(page, 'item13-grid-changed');
    expect(
      Math.abs((dragged.two?.x ?? 0) - initial.two.x) +
        Math.abs((dragged.two?.y ?? 0) - initial.two.y)
    ).toBeGreaterThan(50);

    // --- the layout survives a reload
    await page.reload();
    await expect(one).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState('networkidle');
    const reloaded = await boxes();
    expect(Math.round(reloaded.one?.height ?? 0)).toBe(
      Math.round(dragged.one?.height ?? 0)
    );
    expect(Math.round(reloaded.two?.x ?? 0)).toBe(
      Math.round(dragged.two?.x ?? 0)
    );
    expect(Math.round(reloaded.two?.y ?? 0)).toBe(
      Math.round(dragged.two?.y ?? 0)
    );

    // --- reset layout
    await page.locator('button:has(svg.lucide-ellipsis)').first().click();
    await page.getByRole('menuitem', { name: 'Reset layout' }).click();
    await expect(
      page.getByText('Are you sure you want to reset the layout')
    ).toBeVisible();
    await shot(page, 'item13-grid-reset-confirm', false);
    await page
      .getByRole('button', { name: /^(Yes|Confirm|Reset|OK)/i })
      .click();
    await expect(page.getByText('Layout reset to default')).toBeVisible();
    await page.waitForTimeout(1000);
    const reset = await boxes();
    await shot(page, 'item13-grid-reset');
    expect(Math.round(reset.one?.height ?? 0)).toBe(
      Math.round(initial.one.height)
    );
    expect(Math.round(reset.two?.x ?? 0)).toBe(Math.round(initial.two.x));
    expect(Math.round(reset.two?.y ?? 0)).toBe(Math.round(initial.two.y));

    expect(traffic.bad).toEqual([]);
    expect(traffic.pageErrors).toEqual([]);
  } finally {
    await deleteDashboard(page, dashboard.id);
  }
});

// The only CSV export in the dashboard is the cohort members download;
// report tables have none.
test('cohort members download as CSV', async ({ page }) => {
  const SAAS = 'acme-saas';
  const cohort = await trpcMutation<{ id: string; name: string }>(
    page,
    'cohort.create',
    {
      name: `E2E verify-b csv ${Date.now()}`,
      projectId: SAAS,
      isStatic: false,
      definition: {
        type: 'property',
        criteria: {
          operator: 'and',
          properties: [
            { name: 'profile.properties.plan', operator: 'is', value: ['pro'] },
          ],
        },
      },
    }
  );
  try {
    await expect
      .poll(
        async () =>
          (
            await trpcQuery<{ profileCount: number | null }>(
              page,
              'cohort.get',
              {
                id: cohort.id,
              }
            )
          ).profileCount ?? 0,
        { timeout: 90_000, intervals: [3000] }
      )
      .toBeGreaterThan(0);
    const expected = await trpcQuery<{ profileIds: string[] }>(
      page,
      'cohort.exportProfiles',
      { cohortId: cohort.id }
    );

    await page.goto(`/acme/${SAAS}/cohorts/${cohort.id}`);
    await page.waitForLoadState('networkidle');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`${cohort.name}-members.csv`);
    const path = 'test-results/verify-b/cohort-members.csv';
    await file.saveAs(path);
    const { readFileSync } = await import('node:fs');
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines[0]).toBe('profile_id');
    expect(lines.slice(1).sort()).toEqual([...expected.profileIds].sort());
    expect(lines.length - 1).toBeGreaterThan(0);
  } finally {
    await trpcMutation(page, 'cohort.delete', { id: cohort.id });
  }
});

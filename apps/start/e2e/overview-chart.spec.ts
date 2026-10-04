import { expect as baseExpect, test } from './fixtures';
import {
  attachProblems,
  compactNumber,
  dashedTailStartIndex,
  dismissFeedbackPrompt,
  expectNoRealProblems,
  fetchStats,
  gotoOverview,
  hoverBucket,
  mainChart,
  metricCard,
  overviewReady,
  SLOW_TEST_TIMEOUT_MS,
  shot,
  trpcMutation,
  trpcQuery,
  watchPage,
} from './overview-helpers';

// The shared dev stack answers slowly while other suites run against it.
const expect = baseExpect.configure({ timeout: 30_000 });
test.use({ actionTimeout: 20_000 });

const PROJECT = 'acme-shop';
const HOURS_PER_DAY = 24;
const CHART_MARGIN_X = 20;
// Spike markers sit on the line's peak; for the seeded spike that is the top of the plot.
const SPIKE_MARKER_OFFSET_Y = 16;

test.beforeEach(async ({ page }) => {
  test.setTimeout(SLOW_TEST_TIMEOUT_MS);
  await page.setViewportSize({ width: 1440, height: 1000 });
});

const TOOLTIP_CASES = [
  { range: '7d', interval: 'day', step: 1 },
  { range: 'yesterday', interval: 'hour', step: 3 },
  { range: 'lastMonth', interval: 'day', step: 4 },
] as const;

for (const { range, interval, step } of TOOLTIP_CASES) {
  test(`chart tooltip shows overview.stats values for ${range}/${interval}`, async ({
    page,
  }, testInfo) => {
    const problems = watchPage(page);
    await gotoOverview(page, PROJECT, `?range=${range}&metric=1`);
    await dismissFeedbackPrompt(page);
    const stats = await fetchStats(page, PROJECT, { range, interval });
    const buckets = stats.series.length;

    // The last point sits on the chart's right edge, where the tooltip is not reachable.
    for (let index = 0; index < buckets - 1; index += step) {
      const row = stats.series[index];
      const text = await hoverBucket(page, index, buckets);
      const lines = text.split('\n');
      const valueLine = lines[lines.indexOf('Sessions') + 1];
      expect(valueLine, `${row?.date}: ${text}`).toBe(
        new Intl.NumberFormat('en-US').format(Number(row?.total_sessions))
      );
      const previous = Number(row?.prev_total_sessions ?? 0);
      if (previous > 0 && previous !== Number(row?.total_sessions)) {
        expect(text, `${row?.date} previous`).toContain(
          `(${new Intl.NumberFormat('en-US').format(previous)})`
        );
      }
      expect(text).not.toMatch(/NaN|undefined|Infinity/);
    }
    await shot(page, `chart-tooltip-${range}`, false);

    await attachProblems(testInfo, problems);
    expect(expectNoRealProblems(problems)).toEqual({
      pageErrors: [],
      responses: [],
    });
  });
}

test('previous-period totals on the cards match the API and long ranges skip them', async ({
  page,
}) => {
  await gotoOverview(page, PROJECT, '?range=7d');
  const stats = await fetchStats(page, PROJECT, {});
  const current = Number(stats.metrics.total_sessions);
  const previous = Number(stats.metrics.prev_total_sessions);
  const diff = (Math.abs(current - previous) / previous) * 100;
  await expect(metricCard(page, 'Sessions')).toContainText(
    `${diff.toFixed(1)}%`
  );

  const series = stats.series;
  expect(series.every((row) => row.prev_total_sessions !== undefined)).toBe(
    true
  );
  const previousSum = series.reduce(
    (total, row) => total + Number(row.prev_total_sessions ?? 0),
    0
  );
  expect(previousSum).toBe(previous);
});

test('the incomplete tail is dashed for a running period and solid for a finished one', async ({
  page,
}) => {
  await gotoOverview(page, PROJECT, '?range=7d');
  const week = await fetchStats(page, PROJECT, {});
  expect(await dashedTailStartIndex(page, week.series.length)).toBe(
    week.series.length - 2
  );

  await page.goto(`/acme/${PROJECT}?range=yesterday`);
  await overviewReady(page);
  await expect(mainChart(page).locator('svg').first()).toBeVisible();
  expect(await dashedTailStartIndex(page, HOURS_PER_DAY)).toBeNull();

  await page.goto(`/acme/${PROJECT}?range=lastMonth`);
  await overviewReady(page);
  await expect(mainChart(page).locator('svg').first()).toBeVisible();
  expect(await dashedTailStartIndex(page, 30)).toBeNull();
});

test('custom range through the date picker and the "last days" input', async ({
  page,
}, testInfo) => {
  const problems = watchPage(page);
  await gotoOverview(page, PROJECT, '?range=7d');
  await dismissFeedbackPrompt(page);

  await page.getByRole('button', { name: 'Last 7 days', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Custom range/ }).click();
  const picker = page.getByRole('dialog');
  await expect(picker.getByRole('button', { name: 'Cancel' })).toBeVisible();
  // Nothing is selected yet, so there is nothing to confirm.
  await expect(picker.getByRole('button', { name: /^Select / })).toHaveCount(0);
  await shot(page, 'chart-datepicker-empty', false);

  // The October grid repeats the last September days, hence `first()`.
  await picker
    .getByRole('button', { name: /September 22/ })
    .first()
    .click();
  await picker
    .getByRole('button', { name: /September 28/ })
    .first()
    .click();
  await shot(page, 'chart-datepicker-selected', false);
  await picker.getByRole('button', { name: /^Select / }).click();

  await expect(page).toHaveURL(/range=custom/);
  const search = new URL(page.url()).searchParams;
  expect(search.get('start')).toBe('2026-09-22 00:00:00');
  expect(search.get('end')).toBe('2026-09-28 23:59:59');
  await expect(
    page.getByRole('button', { name: 'Custom range', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Day', exact: true })
  ).toBeVisible();

  const custom = await fetchStats(page, PROJECT, {
    range: 'custom',
    startDate: '2026-09-22 00:00:00',
    endDate: '2026-09-28 23:59:59',
  });
  expect(custom.series).toHaveLength(7);
  await expect(metricCard(page, 'Sessions')).toContainText(
    compactNumber(Number(custom.metrics.total_sessions))
  );
  await shot(page, 'chart-custom-range', false);

  // survives a reload
  await page.reload();
  await overviewReady(page);
  await expect(
    page.getByRole('button', { name: 'Custom range', exact: true })
  ).toBeVisible();
  await expect(metricCard(page, 'Sessions')).toContainText(
    compactNumber(Number(custom.metrics.total_sessions))
  );

  // "Last days" input
  await page.getByRole('button', { name: 'Custom range', exact: true }).click();
  const days = page.getByRole('spinbutton', {
    name: 'Number of days for custom date filter',
  });
  await days.fill('3');
  await days.press('Enter');
  await expect(page).toHaveURL(/start=/);
  await overviewReady(page);
  const lastDays = new URL(page.url()).searchParams;
  expect(lastDays.get('range')).toBe('custom');
  const stats = await fetchStats(page, PROJECT, {
    range: 'custom',
    startDate: lastDays.get('start'),
    endDate: lastDays.get('end'),
  });
  expect(stats.series).toHaveLength(3);
  await expect(metricCard(page, 'Sessions')).toContainText(
    compactNumber(Number(stats.metrics.total_sessions))
  );
  await shot(page, 'chart-last-3-days', false);

  // Out-of-range values are ignored.
  const urlBefore = page.url();
  await page.getByRole('button', { name: 'Custom range', exact: true }).click();
  await days.fill('0');
  await days.press('Enter');
  await days.fill('366');
  await days.press('Enter');
  expect(page.url()).toBe(urlBefore);
  await page.keyboard.press('Escape');

  await attachProblems(testInfo, problems);
  expect(expectNoRealProblems(problems)).toEqual({
    pageErrors: [],
    responses: [],
  });
});

test('referrer spike marker: tooltip annotation and click adds a referrer filter', async ({
  page,
}) => {
  await gotoOverview(page, PROJECT, '?range=7d');
  await dismissFeedbackPrompt(page);
  const spikes = await trpcQuery<
    Array<{
      anchorDate: string;
      spikes: Array<{ referrer_name: string; date: string }>;
    }>
  >(page, 'overview.getReferrerSpikes', {
    projectId: PROJECT,
    range: '7d',
    interval: 'day',
    filters: [],
  });
  expect(spikes.length).toBeGreaterThan(0);
  const spike = spikes[0]?.spikes[0];
  const stats = await fetchStats(page, PROJECT, {});
  const index = stats.series.findIndex((row) => row.date === spike?.date);
  expect(index).toBeGreaterThanOrEqual(0);

  const text = await hoverBucket(page, index, stats.series.length);
  expect(text).toContain(`Spike from ${spike?.referrer_name}`);
  await shot(page, 'chart-spike-tooltip', false);

  const box = await mainChart(page).boundingBox();
  const markerX =
    (box?.x ?? 0) +
    CHART_MARGIN_X +
    (((box?.width ?? 0) - CHART_MARGIN_X * 2) * index) /
      (stats.series.length - 1);
  await page.mouse.click(markerX, (box?.y ?? 0) + SPIKE_MARKER_OFFSET_Y);
  await expect(page).toHaveURL(
    new RegExp(`f=referrer_name(,|%2C)is(,|%2C)${spike?.referrer_name}`)
  );
  await expect(page.getByRole('button', { name: 'Remove filter' })).toHaveCount(
    1
  );
  await shot(page, 'chart-spike-clicked', false);
});

test.describe('references', () => {
  // Pinned so the bucket a reference lands in does not depend on the machine.
  test.use({ timezoneId: 'UTC' });

  test('a reference is annotated on the bucket of its own day', async ({
    page,
  }) => {
    const title = `E2E overview ${Date.now()}`;
    await gotoOverview(page, PROJECT, '?range=7d');
    const reference = await trpcMutation<{ id: string }>(
      page,
      'reference.create',
      {
        title,
        description: 'created by overview-chart.spec.ts',
        projectId: PROJECT,
        datetime: '2026-09-28T15:00:00.000Z',
      }
    );
    try {
      await page.reload();
      await overviewReady(page);
      await dismissFeedbackPrompt(page);
      const stats = await fetchStats(page, PROJECT, {});
      const index = stats.series.findIndex((row) =>
        String(row.date).startsWith('2026-09-28')
      );
      const nextDay = await hoverBucket(page, index + 1, stats.series.length);
      await shot(page, 'chart-reference-next-day', false);
      const ownDay = await hoverBucket(page, index, stats.series.length);
      await shot(page, 'chart-reference-own-day', false);
      expect(
        `${ownDay}${nextDay}`,
        'the reference is on the chart at all'
      ).toContain(title);
      expect(ownDay, 'tooltip of Sep 28').toContain(title);
      expect(nextDay, 'tooltip of Sep 29').not.toContain(title);
    } finally {
      await trpcMutation(page, 'reference.delete', { id: reference.id });
    }
  });
});

test('live visitor histogram shows the last 30 minutes from overview.liveData', async ({
  page,
}) => {
  await gotoOverview(page, PROJECT, '?range=7d');
  const live = await trpcQuery<{
    totalSessions: number;
    minuteCounts: Array<{ time: string; sessionCount: number }>;
  }>(page, 'overview.liveData', { projectId: PROJECT });
  expect(live.minuteCounts).toHaveLength(30);
  const card = page.locator('div.card.grid').first().locator('> div').last();
  await expect(card).toContainText('Live · 30 min');
  await expect(card).toContainText('Last 30 min');
  await expect(card).not.toContainText(/NaN|undefined/);
});

test.describe('timezone', () => {
  for (const timezoneId of ['UTC', 'America/Los_Angeles']) {
    test.describe(timezoneId, () => {
      test.use({ timezoneId });

      test(`"today" is the org's UTC day and the dashed tail starts at the current hour (browser in ${timezoneId})`, async ({
        page,
      }) => {
        await gotoOverview(page, PROJECT, '?range=today');
        const stats = await fetchStats(page, PROJECT, {
          range: 'today',
          interval: 'hour',
        });
        const now = new Date();
        const utcDay = now.toISOString().slice(0, 10);
        expect(stats.series).toHaveLength(HOURS_PER_DAY);
        expect(stats.series[0]?.date).toBe(`${utcDay} 00:00:00`);
        expect(stats.series.at(-1)?.date).toBe(`${utcDay} 23:00:00`);
        const futureSessions = stats.series
          .slice(now.getUTCHours() + 1)
          .reduce((total, row) => total + Number(row.total_sessions), 0);
        expect(futureSessions).toBe(0);

        await expect(metricCard(page, 'Sessions')).toContainText(
          compactNumber(Number(stats.metrics.total_sessions))
        );
        await shot(page, `chart-today-${timezoneId.replace('/', '-')}`, false);
        const dashStart = await dashedTailStartIndex(page, HOURS_PER_DAY);
        // The tail starts two buckets before the running hour.
        expect(dashStart).toBe(Math.max(0, now.getUTCHours() - 2));
      });
    });
  }
});

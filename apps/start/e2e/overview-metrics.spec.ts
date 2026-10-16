import { expect as baseExpect, test } from './fixtures';
import {
  attachProblems,
  gotoOverview,
  mainChart,
  metricCard,
  overviewReady,
  PROJECT_IDS,
  SLOW_TEST_TIMEOUT_MS,
  shot,
  trpcQuery,
  watchPage,
} from './overview-helpers';

interface StatsSeriesRow {
  date: string;
  unique_visitors: number;
  total_sessions: number;
  total_screen_views: number;
  views_per_session: number;
  bounce_rate: number;
  avg_session_duration: number;
  total_revenue: number;
  prev_unique_visitors?: number | null;
  prev_total_sessions?: number | null;
}
interface Stats {
  metrics: Record<string, number | null>;
  series: StatsSeriesRow[];
}

const compact = (value: number) =>
  new Intl.NumberFormat('en-US', { notation: 'compact' }).format(value);

const METRIC_CARDS = [
  { index: 0, title: 'Unique Visitors', key: 'unique_visitors' },
  { index: 1, title: 'Sessions', key: 'total_sessions' },
  { index: 2, title: 'Pageviews', key: 'total_screen_views' },
  { index: 3, title: 'Pages per session', key: 'views_per_session' },
  { index: 4, title: 'Bounce Rate', key: 'bounce_rate' },
  { index: 5, title: 'Session Duration', key: 'avg_session_duration' },
  { index: 6, title: 'Revenue', key: 'total_revenue' },
] as const;

const RANGES = [
  {
    key: '30min',
    label: 'Last 30 min',
    interval: 'Minute',
    enabled: ['Minute', 'Hour', 'Day'],
  },
  {
    key: 'lastHour',
    label: 'Last hour',
    interval: 'Minute',
    enabled: ['Minute', 'Hour', 'Day'],
  },
  {
    key: 'last24h',
    label: 'Last 24 hours',
    interval: 'Hour',
    enabled: ['Hour', 'Day'],
  },
  { key: 'today', label: 'Today', interval: 'Hour', enabled: ['Hour', 'Day'] },
  {
    key: 'yesterday',
    label: 'Yesterday',
    interval: 'Hour',
    enabled: ['Hour', 'Day', 'Week', 'Month'],
  },
  {
    key: '7d',
    label: 'Last 7 days',
    interval: 'Day',
    enabled: ['Hour', 'Day', 'Month'],
  },
  {
    key: '30d',
    label: 'Last 30 days',
    interval: 'Day',
    enabled: ['Day', 'Week', 'Month'],
  },
  {
    key: '3m',
    label: 'Last 3 months',
    interval: 'Day',
    enabled: ['Day', 'Week', 'Month'],
  },
  {
    key: '6m',
    label: 'Last 6 months',
    interval: 'Week',
    enabled: ['Day', 'Week', 'Month'],
  },
  {
    key: '12m',
    label: 'Last 12 months',
    interval: 'Month',
    enabled: ['Day', 'Week', 'Month'],
  },
  {
    key: 'monthToDate',
    label: 'Month to Date',
    interval: 'Day',
    enabled: ['Day', 'Week', 'Month'],
  },
  {
    key: 'lastMonth',
    label: 'Last Month',
    interval: 'Day',
    enabled: ['Day', 'Week', 'Month'],
  },
  {
    key: 'yearToDate',
    label: 'Year to Date',
    interval: 'Month',
    enabled: ['Day', 'Week', 'Month'],
  },
  {
    key: 'lastYear',
    label: 'Last year',
    interval: 'Month',
    enabled: ['Day', 'Week', 'Month'],
  },
] as const;

const ALL_INTERVALS = ['Minute', 'Hour', 'Day', 'Week', 'Month'] as const;

// The shared dev stack answers slowly while other suites run against it.
const expect = baseExpect.configure({ timeout: 30_000 });
test.use({ actionTimeout: 20_000 });

test.beforeEach(async ({ page }) => {
  test.setTimeout(SLOW_TEST_TIMEOUT_MS);
  await page.setViewportSize({ width: 1440, height: 1000 });
});

for (const projectId of PROJECT_IDS) {
  test(`${projectId}: metric cards match overview.stats and switching the metric drives the chart`, async ({
    page,
  }, testInfo) => {
    const problems = watchPage(page);
    await gotoOverview(page, projectId, '?range=7d');
    const stats = await trpcQuery<Stats>(page, 'overview.stats', {
      projectId,
      range: '7d',
      interval: 'day',
      filters: [],
    });

    const card = (title: string) => metricCard(page, title);
    await expect(card('Unique Visitors')).toContainText(
      compact(stats.metrics.unique_visitors ?? 0)
    );
    await expect(card('Sessions')).toContainText(
      compact(stats.metrics.total_sessions ?? 0)
    );
    await expect(card('Pageviews')).toContainText(
      compact(stats.metrics.total_screen_views ?? 0)
    );
    await expect(card('Pages per session')).toContainText(
      compact(stats.metrics.views_per_session ?? 0)
    );
    await expect(card('Bounce Rate')).toContainText(
      new Intl.NumberFormat('en-US').format(stats.metrics.bounce_rate ?? 0)
    );
    for (const { title } of METRIC_CARDS) {
      await expect(card(title)).not.toContainText(/NaN|undefined|null|N\/A/);
    }

    for (const { index, title } of METRIC_CARDS) {
      await card(title).click();
      await expect(page).toHaveURL(
        index === 0 ? /^(?!.*metric=[1-9])/ : new RegExp(`metric=${index}`)
      );
      await expect(
        page.locator('div.card.p-4 >> div.text-muted-foreground', {
          hasText: new RegExp(`^${title}$`),
        })
      ).toBeVisible();
      await expect(mainChart(page).locator('svg').first()).toBeVisible();
    }
    await shot(page, `metrics-${projectId}-revenue`, false);

    // metric survives reload
    await page.reload();
    await overviewReady(page);
    await expect(page).toHaveURL(/metric=6/);
    await expect(
      page.locator('div.card.p-4 >> div.text-muted-foreground', {
        hasText: /^Revenue$/,
      })
    ).toBeVisible();

    await attachProblems(testInfo, problems);
    expect(problems.pageErrors).toEqual([]);
    expect(
      problems.badResponses.filter((r) => !r.includes('api.openpanel.dev'))
    ).toEqual([]);
  });
}

test('every range can be picked, sets its default interval and enables the right intervals', async ({
  page,
}, testInfo) => {
  const problems = watchPage(page);
  await gotoOverview(page, 'acme-shop', '?range=7d');

  for (const range of RANGES) {
    await page
      .getByRole('button', {
        name: /^(Last|Today|Yesterday|Month|Year|Custom)/,
      })
      .first()
      .click();
    await page
      .getByRole('menuitem', { name: new RegExp(`^${range.label}`) })
      .click();
    await expect(page).toHaveURL(new RegExp(`range=${range.key}(&|$)`));
    await overviewReady(page);
    await expect(
      page.getByRole('button', { name: range.label, exact: true })
    ).toBeVisible();
    const intervalButton = page.getByRole('button', {
      name: /^(Minute|Hour|Day|Week|Month)$/,
    });
    await expect(intervalButton).toHaveText(range.interval);
    await expect(metricCard(page, 'Unique Visitors')).toContainText(
      range.label
    );

    await intervalButton.click();
    for (const interval of ALL_INTERVALS) {
      const item = page.getByRole('menuitem', {
        name: new RegExp(`^${interval}`),
      });
      if ((range.enabled as readonly string[]).includes(interval)) {
        await expect(item, `${range.key}/${interval}`).toBeEnabled();
      } else {
        await expect(item, `${range.key}/${interval}`).toBeDisabled();
      }
    }
    await page.keyboard.press('Escape');
    await shot(page, `range-${range.key}`, false);
  }

  await attachProblems(testInfo, problems);
  expect(problems.pageErrors).toEqual([]);
  expect(
    problems.badResponses.filter((r) => !r.includes('api.openpanel.dev'))
  ).toEqual([]);
});

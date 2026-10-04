import { readFileSync } from 'node:fs';
import {
  type APIRequestContext,
  type Page,
  request as playwrightRequest,
} from '@playwright/test';
import { expect, test } from './fixtures';
import {
  API_URL,
  clickhouseNumber,
  openHydrated,
  SHOTS_DIR,
  trpcMutation,
  trpcQuery,
  watchProblems,
} from './verify-a-helpers';

const PROJECT = 'acme-saas';
const BASE = `/acme/${PROJECT}`;
const AUTH_STATE = 'e2e/.auth/user.json';
const COMPUTE_TIMEOUT_MS = 90_000;
const RECOMPUTE_VISIBLE_MS = 45_000;
const LAST_30_DAYS = { type: 'relative', value: '30d' } as const;

// What the summary views the cohort queries read are built from: events of
// identified profiles only.
const IDENTIFIED_EVENTS = `FROM events WHERE project_id = '${PROJECT}' AND profile_id != device_id AND created_at >= toDate(now() - INTERVAL 30 DAY)`;

interface Filter {
  name: string;
  operator: string;
  value: string[];
}

const eventCriteria = (name: string, filters: Filter[] = []) => ({
  name,
  filters,
  timeframe: LAST_30_DAYS,
});

const eventDefinition = (
  operator: 'and' | 'or',
  ...events: ReturnType<typeof eventCriteria>[]
) => ({ type: 'event', criteria: { operator, events } });

const propertyIs = (name: string, value: string): Filter => ({
  name: `properties.${name}`,
  operator: 'is',
  value: [value],
});

interface CohortCase {
  definition: unknown;
  /** Counts the same members straight from `events`. */
  expected: string;
  isStatic?: boolean;
}

const CASES = {
  didEvent: {
    definition: eventDefinition('or', eventCriteria('report_created')),
    expected: `SELECT uniqExact(profile_id) ${IDENTIFIED_EVENTS} AND name = 'report_created'`,
  },
  oneProperty: {
    definition: eventDefinition(
      'or',
      eventCriteria('feature_used', [propertyIs('feature', 'cohorts')])
    ),
    expected: `SELECT uniqExact(profile_id) ${IDENTIFIED_EVENTS} AND name = 'feature_used' AND properties['feature'] = 'cohorts'`,
  },
  twoProperties: {
    definition: eventDefinition(
      'or',
      eventCriteria('report_viewed', [
        propertyIs('report_type', 'funnel'),
        propertyIs('range', '7d'),
      ])
    ),
    expected: `SELECT uniqExact(profile_id) ${IDENTIFIED_EVENTS} AND name = 'report_viewed' AND properties['report_type'] = 'funnel' AND properties['range'] = '7d'`,
  },
  startsWith: {
    definition: eventDefinition(
      'or',
      eventCriteria('feature_used', [
        { name: 'properties.feature', operator: 'startsWith', value: ['fun'] },
      ])
    ),
    expected: `SELECT uniqExact(profile_id) ${IDENTIFIED_EVENTS} AND name = 'feature_used' AND properties['feature'] LIKE 'fun%'`,
  },
  eventColumn: {
    definition: eventDefinition(
      'or',
      eventCriteria('screen_view', [
        { name: 'path', operator: 'is', value: ['/settings/billing'] },
      ])
    ),
    expected: `SELECT uniqExact(profile_id) ${IDENTIFIED_EVENTS} AND name = 'screen_view' AND path = '/settings/billing'`,
  },
  anyOfTwoEvents: {
    definition: eventDefinition(
      'or',
      eventCriteria('checkout_started'),
      eventCriteria('pricing_viewed')
    ),
    expected: `SELECT uniqExact(profile_id) ${IDENTIFIED_EVENTS} AND name IN ('checkout_started', 'pricing_viewed')`,
  },
  profileProperty: {
    definition: {
      type: 'property',
      criteria: {
        operator: 'and',
        properties: [
          {
            name: 'profile.properties.company_size',
            operator: 'is',
            value: ['11-50'],
          },
        ],
      },
    },
    expected: `SELECT count() FROM profiles FINAL WHERE project_id = '${PROJECT}' AND properties['company_size'] = '11-50'`,
  },
  frozen: {
    definition: eventDefinition('or', eventCriteria('subscription_started')),
    expected: `SELECT uniqExact(profile_id) ${IDENTIFIED_EVENTS} AND name = 'subscription_started'`,
    isStatic: true,
  },
} satisfies Record<string, CohortCase>;

type CaseName = keyof typeof CASES;

interface Cohort {
  id: string;
  name: string;
  profileCount: number;
  lastComputedAt: string | null;
}

let api: APIRequestContext;
const cohorts = {} as Record<CaseName, Cohort>;

const getCohort = (id: string) => trpcQuery<Cohort>(api, 'cohort.get', { id });

/** The number on the overview's "Members" tile (the tab of the same name carries no number). */
const shownMemberCount = async (page: Page) => {
  const text = await page.locator('body').innerText();
  const match = /members\s*\n\s*([\d,]+)\s*\n/i.exec(text);
  return match ? Number(match[1].replace(/,/g, '')) : null;
};

test.beforeAll(async () => {
  api = await playwrightRequest.newContext({
    ignoreHTTPSErrors: true,
    baseURL: API_URL,
    storageState: JSON.parse(readFileSync(AUTH_STATE, 'utf8')),
  });
  const stamp = Date.now();
  for (const [name, cohortCase] of Object.entries(CASES) as [
    CaseName,
    CohortCase,
  ][]) {
    cohorts[name] = await trpcMutation<Cohort>(api, 'cohort.create', {
      name: `E2E verify-a ${stamp} ${name}`,
      projectId: PROJECT,
      definition: cohortCase.definition,
      isStatic: cohortCase.isStatic ?? false,
    });
  }
  for (const name of Object.keys(CASES) as CaseName[]) {
    await expect
      .poll(async () => (await getCohort(cohorts[name].id)).lastComputedAt, {
        timeout: COMPUTE_TIMEOUT_MS,
        message: `${name} was never computed`,
      })
      .not.toBeNull();
  }
});

test.afterAll(async () => {
  for (const cohort of Object.values(cohorts)) {
    await api
      .post(`${API_URL}/trpc/cohort.delete`, {
        data: { json: { id: cohort.id } },
      })
      .catch(() => undefined);
  }
  await api.dispose();
});

test('member counts match a direct count of the events', async () => {
  for (const [name, cohortCase] of Object.entries(CASES) as [
    CaseName,
    CohortCase,
  ][]) {
    const expected = await clickhouseNumber(cohortCase.expected);
    const computed = await getCohort(cohorts[name].id);
    const stored = await clickhouseNumber(
      `SELECT count() FROM cohort_members FINAL WHERE project_id = '${PROJECT}' AND cohort_id = '${cohorts[name].id}'`
    );
    expect.soft(stored, `${name}: stored members`).toBe(computed.profileCount);
    expect.soft(computed.profileCount, `${name}: member count`).toBe(expected);
  }
});

test('detail page: overview, members, events, download and refresh', async ({
  page,
}) => {
  const problems = watchProblems(page);
  const cohort = cohorts.oneProperty;
  const expected = await clickhouseNumber(CASES.oneProperty.expected);
  await openHydrated(page, `${BASE}/cohorts/${cohort.id}`);
  await expect.poll(() => shownMemberCount(page)).toBe(expected);
  await expect(page.getByText('Popular events')).toBeVisible();
  await page.screenshot({
    path: `${SHOTS_DIR}/cohort-overview.png`,
    fullPage: true,
  });

  await page.getByRole('tab', { name: 'Members' }).click();
  await expect(page).toHaveURL(/\/members$/);
  await expect(page.locator('tbody tr')).toHaveCount(expected);

  await page.getByRole('tab', { name: 'Events' }).click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(page.locator('[data-index]').first()).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const file = await download;
  const csv = readFileSync(await file.path(), 'utf8')
    .trim()
    .split('\n');
  expect(csv[0]).toBe('profile_id');
  expect(csv.length - 1).toBe(expected);

  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByText('Cohort refresh queued.')).toBeVisible();
  expect(problems).toEqual([]);
});

test('a frozen cohort is marked static and cannot be refreshed', async ({
  page,
}) => {
  const expected = await clickhouseNumber(CASES.frozen.expected);
  await openHydrated(page, `${BASE}/cohorts/${cohorts.frozen.id}`);
  await expect(page.getByText('Static', { exact: true })).toBeVisible();
  await expect.poll(() => shownMemberCount(page)).toBe(expected);
  await expect(page.getByRole('button', { name: 'Refresh' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
});

test('editing the criteria recomputes and the page shows the new count', async ({
  page,
}) => {
  const cohort = cohorts.anyOfTwoEvents;
  const both = await clickhouseNumber(
    `SELECT count() FROM (SELECT profile_id ${IDENTIFIED_EVENTS} AND name = 'checkout_started' INTERSECT SELECT profile_id ${IDENTIFIED_EVENTS} AND name = 'pricing_viewed')`
  );
  await openHydrated(page, `${BASE}/cohorts/${cohort.id}`);
  await page.getByRole('button', { name: 'Edit' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Any', exact: true }).click();
  await page.getByRole('menuitem').filter({ hasText: 'All' }).click();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Cohort updated.')).toBeVisible();

  await expect
    .poll(async () => (await getCohort(cohort.id)).profileCount, {
      timeout: COMPUTE_TIMEOUT_MS,
    })
    .toBe(both);
  await expect
    .poll(() => shownMemberCount(page), {
      timeout: RECOMPUTE_VISIBLE_MS,
      message: 'the open page picks up the recomputed count without a reload',
    })
    .toBe(both);
});

test('profiles list: in cohort and not in cohort', async ({ page }) => {
  const cohort = cohorts.oneProperty;
  const members = await clickhouseNumber(CASES.oneProperty.expected);
  const identified = await clickhouseNumber(
    `SELECT count() FROM profiles FINAL WHERE project_id = '${PROJECT}' AND is_external`
  );
  const counts: number[] = [];
  page.on('response', async (response) => {
    if (response.url().includes('/trpc/profile.list')) {
      const body = await response.json().catch(() => null);
      counts.push(body?.result?.data?.json?.meta?.count);
    }
  });

  await openHydrated(page, `${BASE}/profiles`);
  await page
    .getByRole('button', { name: /Filters/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Add filter' }).click();
  await page.getByRole('menuitem', { name: 'Cohorts' }).click();
  await page.getByText('Select cohorts...').click();
  await page.getByPlaceholder('Search').last().fill(cohort.name);
  await page.getByText(cohort.name).last().click();
  await expect.poll(() => counts.at(-1)).toBe(members);
  await expect(page).toHaveURL(new RegExp(`inCohort,,${cohort.id}`));
  await page.keyboard.press('Escape');

  await page
    .getByRole('button', { name: 'In cohort', exact: true })
    .last()
    .click();
  await page.getByRole('menuitem', { name: 'Not in cohort' }).click();
  await expect.poll(() => counts.at(-1)).toBe(identified - members);
  await page.screenshot({ path: `${SHOTS_DIR}/profiles-not-in-cohort.png` });
});

test('overview: a cohort filter narrows the metrics to the cohort members', async ({
  page,
}) => {
  const cohort = cohorts.oneProperty;
  const memberVisitors = await clickhouseNumber(
    `SELECT uniqExact(profile_id) FROM sessions WHERE project_id = '${PROJECT}' AND created_at >= now() - INTERVAL 31 DAY AND profile_id IN (SELECT profile_id FROM cohort_members FINAL WHERE project_id = '${PROJECT}' AND cohort_id = '${cohort.id}')`
  );
  const stats = page.waitForResponse(
    (response) =>
      response.url().includes('/trpc/overview.stats') &&
      decodeURIComponent(response.url()).includes(cohort.id)
  );
  await openHydrated(page, `${BASE}?range=30d&f=cohort,inCohort,,${cohort.id}`);
  const body = await (await stats).json();
  await page.screenshot({
    path: `${SHOTS_DIR}/overview-cohort-filter.png`,
    fullPage: true,
  });
  expect(body.result.data.json.metrics.unique_visitors).toBe(memberVisitors);
});

test('deleting a cohort removes it from the list and drops its members', async ({
  page,
}) => {
  const cohort = cohorts.didEvent;
  await openHydrated(page, `${BASE}/cohorts/${cohort.id}`);
  await page.getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText(cohort.name);
  await confirm.getByRole('button', { name: /Yes|Confirm|Delete/ }).click();
  await expect(page).toHaveURL(/\/cohorts$/);
  await expect(page.getByText(cohort.name)).toHaveCount(0);
  await expect
    .poll(() =>
      clickhouseNumber(
        `SELECT count() FROM cohort_members FINAL WHERE project_id = '${PROJECT}' AND cohort_id = '${cohort.id}'`
      )
    )
    .toBe(0);
});

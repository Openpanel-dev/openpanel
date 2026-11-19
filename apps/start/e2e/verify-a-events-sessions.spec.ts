import { expect, test } from './fixtures';
import {
  clickhouseText,
  openHydrated,
  SHOTS_DIR,
  watchProblems,
} from './verify-a-helpers';

const SHOP = '/acme/acme-shop';
const EVENT_LIST_PAGE_SIZE = 50;
const FILTER_QUERY =
  'events=add_to_cart&startDate=2026-09-25T00:00:00.000Z&endDate=2026-09-30T00:00:00.000Z';

test('switching between the Events, Conversions and Stats tabs keeps the active filters', async ({
  page,
}) => {
  const problems = watchProblems(page);
  await openHydrated(page, `${SHOP}/events/events?${FILTER_QUERY}`);
  await expect(page).toHaveURL(/events=add_to_cart/);

  for (const tab of ['Conversions', 'Stats', 'Events']) {
    await page.getByRole('tab', { name: tab }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${tab.toLowerCase()}`));
    const search = new URL(page.url()).searchParams;
    expect
      .soft(search.get('events'), `event-name filter after opening ${tab}`)
      .toBe('add_to_cart');
    expect
      .soft(search.get('startDate'), `date range after opening ${tab}`)
      .not.toBeNull();
  }
  expect(problems).toEqual([]);
});

test('a session with more events than one page shows every event', async ({
  page,
}) => {
  const largest = await clickhouseText(
    `SELECT session_id, count() AS events FROM events WHERE project_id = 'acme-shop' AND session_id != '' GROUP BY session_id HAVING events > ${EVENT_LIST_PAGE_SIZE} ORDER BY events DESC LIMIT 1`
  );
  test.skip(
    largest === '',
    `no acme-shop session has more than ${EVENT_LIST_PAGE_SIZE} events; send some through /track first`
  );
  const [sessionId, eventCount] = largest.split('\t');

  await openHydrated(page, `${SHOP}/sessions/${sessionId}`);
  await expect(page.getByText('Session info')).toBeVisible();
  const eventsWidget = page
    .locator('div')
    .filter({ has: page.getByText('Events', { exact: true }) })
    .filter({ has: page.locator('.divide-y') })
    .last();
  const timelineRows = eventsWidget.locator('.divide-y > div');
  await expect(timelineRows.first()).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.screenshot({
    path: `${SHOTS_DIR}/session-over-one-page.png`,
    fullPage: true,
  });

  const hasPagination =
    (await page
      .getByRole('button', { name: /load more|show more|next/i })
      .count()) > 0;
  const shown = await timelineRows.count();
  expect(
    shown === Number(eventCount) || hasPagination,
    `timeline shows ${shown} of ${eventCount} events and offers no pagination`
  ).toBe(true);
});

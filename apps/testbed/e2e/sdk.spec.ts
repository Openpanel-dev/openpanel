import { expect, test } from '@playwright/test';
import { TESTBED_URL } from '../playwright.config';
import { type StoredEvent, waitForEvents } from './clickhouse';

const OUTGOING_LINK = 'https://openpanel.dev/';
const SCRIPT_TAG_EVENTS = [
  'op_call_before_load',
  'op_apply_before_load',
  'op_call_after_load',
  'op_apply_after_load',
];

function byName(events: StoredEvent[], name: string) {
  return events.filter((event) => event.name === name);
}

test('the web SDK stores screen views, custom and automatic events with their page', async ({
  page,
}) => {
  const since = new Date();
  // The click would leave the testbed; the stub keeps the browser here.
  await page.route(`${OUTGOING_LINK}**`, (route) =>
    route.fulfill({ body: 'stub', contentType: 'text/plain' })
  );

  await page.goto('/');
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await page.getByRole('link', { name: 'Classic T-Shirt' }).click();
  await expect(page).toHaveURL(/\/product\/p1$/);

  await page.getByTestId('sdk-fixture-data-track').click();
  await page.getByTestId('sdk-fixture-outgoing-link').click();

  const events = await waitForEvents(
    TESTBED_URL,
    since,
    (stored) =>
      byName(stored, 'screen_view').length >= 2 &&
      byName(stored, 'add_to_cart').length >= 1 &&
      byName(stored, 'testbed_cta').length >= 1 &&
      byName(stored, 'link_out').length >= 1
  );

  expect(byName(events, 'screen_view').map((event) => event.path)).toEqual([
    '/',
    '/product/p1',
  ]);

  const [addToCart] = byName(events, 'add_to_cart');
  expect(addToCart?.path).toBe('/');
  expect(addToCart?.properties).toMatchObject({ product_id: 'p1' });

  const [cta] = byName(events, 'testbed_cta');
  expect(cta?.path).toBe('/product/p1');
  expect(cta?.properties).toMatchObject({ ctaTarget: 'docs' });

  const [linkOut] = byName(events, 'link_out');
  expect(linkOut?.path).toBe('/product/p1');
  expect(linkOut?.properties).toMatchObject({ href: OUTGOING_LINK });
});

test('the script tag keeps events sent through window.op.call, as Turbopack compiles window.op?.()', async ({
  page,
}) => {
  const since = new Date();
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  await page.goto('/script-tag.html');
  await page.waitForFunction(() => 'loadTracker' in window);

  await page.evaluate(() => {
    window.op.call(window, 'track', 'op_call_before_load', { via: 'call' });
    window.op.apply(window, ['track', 'op_apply_before_load']);
  });
  await page.evaluate(() => window.loadTracker());
  await page.evaluate(() => {
    window.op.call(window, 'track', 'op_call_after_load', { via: 'call' });
    window.op.apply(window, ['track', 'op_apply_after_load']);
  });

  const events = await waitForEvents(TESTBED_URL, since, (stored) =>
    SCRIPT_TAG_EVENTS.every((name) => byName(stored, name).length >= 1)
  );

  expect(pageErrors).toEqual([]);
  for (const name of SCRIPT_TAG_EVENTS) {
    expect(byName(events, name)[0]?.path).toBe('/script-tag.html');
  }
  expect(byName(events, 'op_call_before_load')[0]?.properties).toMatchObject({
    via: 'call',
  });
  expect(byName(events, 'op_call_after_load')[0]?.properties).toMatchObject({
    via: 'call',
  });
});

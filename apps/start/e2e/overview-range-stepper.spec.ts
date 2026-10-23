import { expect as baseExpect, test } from './fixtures';
import {
  attachProblems,
  dismissFeedbackPrompt,
  expectNoRealProblems,
  gotoOverview,
  overviewReady,
  shot,
  watchPage,
} from './overview-helpers';

const expect = baseExpect.configure({ timeout: 30_000 });
test.use({ actionTimeout: 20_000 });

const PROJECT = 'acme-shop';

function searchParams(page: { url: () => string }) {
  return new URL(page.url()).searchParams;
}

test('the date picker opens as one popover with presets and a calendar', async ({
  page,
}, testInfo) => {
  const problems = watchPage(page);
  await gotoOverview(page, PROJECT, '?range=7d');
  await dismissFeedbackPrompt(page);

  await page.getByRole('button', { name: 'Last 7 days', exact: true }).click();
  const picker = page.getByRole('dialog');
  await expect(
    picker.getByRole('button', { name: 'Last 30 min' })
  ).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Last year' })).toBeVisible();
  await expect(picker.getByRole('grid')).toHaveCount(2);
  await expect(picker.getByRole('button', { name: 'Apply' })).toBeDisabled();
  await shot(page, 'range-picker-open', false);

  // A preset applies at once and closes the picker.
  await picker.getByRole('button', { name: 'Yesterday' }).click();
  await expect(picker).toBeHidden();
  await expect(page).toHaveURL(/range=yesterday/);
  await expect(
    page.getByRole('button', { name: 'Yesterday', exact: true })
  ).toBeVisible();

  await attachProblems(testInfo, problems);
  expect(expectNoRealProblems(problems)).toEqual({
    pageErrors: [],
    responses: [],
  });
});

test('on a phone the presets sit above a single-month calendar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoOverview(page, PROJECT, '?range=7d');
  await dismissFeedbackPrompt(page);
  await page.getByRole('button', { name: 'Last 7 days', exact: true }).click();
  const picker = page.getByRole('dialog');
  await expect(picker.getByRole('grid')).toHaveCount(1);
  await expect(picker.getByRole('button', { name: 'Apply' })).toBeVisible();
  // The popover fades in; a screenshot mid-animation looks transparent.
  await expect(picker).toHaveCSS('opacity', '1');
  await shot(page, 'range-picker-mobile', false);
});

test('the arrows step the window by its own length and stop at today', async ({
  page,
}) => {
  await gotoOverview(page, PROJECT, '?range=7d');
  await dismissFeedbackPrompt(page);

  // "Last 7 days" on 2026-10-23 is Oct 16 – Oct 23, the same eight days the API uses.
  await page.getByRole('button', { name: 'Next period' }).isDisabled();
  await page.getByRole('button', { name: 'Previous period' }).click();
  await expect(page).toHaveURL(/range=custom/);
  expect(searchParams(page).get('start')).toBe('2026-10-08 00:00:00');
  expect(searchParams(page).get('end')).toBe('2026-10-15 23:59:59');
  await overviewReady(page);
  await expect(
    page.getByRole('button', { name: '8 oct – 15 oct', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Day', exact: true })
  ).toBeVisible();
  await shot(page, 'range-stepper-previous', false);

  await page.getByRole('button', { name: 'Next period' }).click();
  await expect(
    page.getByRole('button', { name: '16 oct – 23 oct', exact: true })
  ).toBeVisible();
  expect(searchParams(page).get('start')).toBe('2026-10-16 00:00:00');
  expect(searchParams(page).get('end')).toBe('2026-10-23 23:59:59');
  await expect(
    page.getByRole('button', { name: 'Next period' })
  ).toBeDisabled();
});

test('stepping a calendar month keeps whole months', async ({ page }) => {
  await gotoOverview(page, PROJECT, '?range=lastMonth');
  await dismissFeedbackPrompt(page);

  await page.getByRole('button', { name: 'Previous period' }).click();
  await expect(
    page.getByRole('button', { name: '1 aug – 31 aug', exact: true })
  ).toBeVisible();
  expect(searchParams(page).get('start')).toBe('2026-08-01 00:00:00');
  expect(searchParams(page).get('end')).toBe('2026-08-31 23:59:59');

  await page.getByRole('button', { name: 'Next period' }).click();
  await expect(
    page.getByRole('button', { name: '1 sep – 30 sep', exact: true })
  ).toBeVisible();
});

test('stepping a minute window keeps the minute interval', async ({ page }) => {
  await gotoOverview(page, PROJECT, '?range=30min');
  await dismissFeedbackPrompt(page);
  await expect(
    page.getByRole('button', { name: 'Minute', exact: true })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Previous period' }).click();
  await expect(page).toHaveURL(/range=custom/);
  await expect(page).toHaveURL(/overrideInterval=minute/);
  await expect(
    page.getByRole('button', { name: 'Minute', exact: true })
  ).toBeVisible();
});

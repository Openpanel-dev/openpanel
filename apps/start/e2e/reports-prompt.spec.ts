// The empty report editor drafts a report from a description. Needs an AI
// provider on the API; without one the editor shows the event picker instead.

import { expect, test } from './fixtures';
import {
  hideFeedbackPrompt,
  shot,
  trackProblems,
  trpcQuery,
  waitForChart,
} from './reports-helpers';

const SHOP = 'acme-shop';
const DRAFT_TIMEOUT = 90_000;

interface ChatModels {
  models: Array<{ id: string }>;
}

test.use({ actionTimeout: 20_000 });

test.beforeEach(async ({ page }) => {
  await hideFeedbackPrompt(page);
});

test('an empty report is drafted from a description and can be saved', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const problems = trackProblems(page);
  await page.goto(`/acme/${SHOP}/reports`);
  const chat = await trpcQuery<ChatModels>(page, 'chat.models', undefined);
  test.skip(chat.models.length === 0, 'no AI provider configured on the API');

  const promptBox = page.getByLabel('Describe the report');
  await expect(promptBox).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await shot(page, 'prompt-empty');

  await promptBox.fill(
    'Purchases per day for the last 7 days, split by device'
  );
  await page.keyboard.press('Enter');
  await expect(promptBox).toBeHidden({ timeout: DRAFT_TIMEOUT });
  await waitForChart(page);
  await shot(page, 'prompt-drafted');

  // The editor, not the toast that also names the draft.
  const editor = page.locator('#report-editor').locator('..');
  await expect(
    editor.getByText('purchase', { exact: false }).first()
  ).toBeVisible();
  await expect(editor.getByText('by device', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Last 7 days' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Unnamed Report' })
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();

  expect(problems.pageErrors).toEqual([]);
});

test('a request with no matching events explains what is tracked instead', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto(`/acme/${SHOP}/reports`);
  const chat = await trpcQuery<ChatModels>(page, 'chat.models', undefined);
  test.skip(chat.models.length === 0, 'no AI provider configured on the API');

  const promptBox = page.getByLabel('Describe the report');
  await expect(promptBox).toBeVisible({ timeout: 30_000 });
  await promptBox.fill('unicorn sightings by moon phase');
  await page.keyboard.press('Enter');
  const notice = page.getByRole('status').filter({ hasText: /./ }).last();
  await expect(notice).toBeVisible({ timeout: DRAFT_TIMEOUT });
  await expect(notice).not.toHaveText(/Reading|Drafting|Almost/);
  await expect(promptBox).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
});

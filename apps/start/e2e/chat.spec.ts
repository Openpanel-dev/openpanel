import { expect as baseExpect, test } from './fixtures';

// A real model answers the question, so the budget is generous.
const expect = baseExpect.configure({ timeout: 60_000 });
test.describe.configure({ timeout: 240_000 });

const CHAT = '/acme/acme-web/chat';
const NOT_CONFIGURED = 'AI chat is not configured';

test.describe('AI chat', () => {
  test('the chat page has a composer and suggestions', async ({ page }) => {
    await page.goto(CHAT);
    await expect(
      page.getByText(/What do you want to know\?|AI chat is not configured/)
    ).toBeVisible();
    if (await page.getByText(NOT_CONFIGURED).isVisible()) {
      return;
    }
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New chat' })).toBeVisible();
  });

  test('Cmd+J opens the chat from a project page', async ({ page }) => {
    await page.goto('/acme/acme-web', { waitUntil: 'networkidle' });
    await expect(page.getByPlaceholder('Ask AI anything…')).toBeVisible();
    // A key press before hydration is lost; press until the app answers.
    await expect(async () => {
      await page.keyboard.press('ControlOrMeta+j');
      await expect(page).toHaveURL(/\/acme\/acme-web\/chat/, { timeout: 1000 });
    }).toPass({ timeout: 30_000 });
  });

  test('the sidebar composer carries the question into the chat', async ({
    page,
  }) => {
    await page.goto('/acme/acme-web', { waitUntil: 'networkidle' });
    const composer = page.getByPlaceholder('Ask AI anything…');
    // Before hydration the form submits natively; type and submit until the app answers.
    await expect(async () => {
      await composer.fill('What changed this week?');
      await composer.press('Enter');
      await expect(page).toHaveURL(/\/acme\/acme-web\/chat/, { timeout: 1000 });
    }).toPass({ timeout: 30_000 });
    if (await page.getByText(NOT_CONFIGURED).isVisible()) {
      test.skip();
      return;
    }
    // The question is sent on arrival and the URL settles on the new conversation.
    await expect(page.getByText('What changed this week?')).toBeVisible();
    await expect(page).toHaveURL(/\/chat\?.*c=/);
  });

  test('a question gets an answer and the conversation is listed', async ({
    page,
  }) => {
    await page.goto(CHAT);
    if (await page.getByText(NOT_CONFIGURED).isVisible()) {
      test.skip();
      return;
    }
    const input = page.getByRole('textbox', { name: 'Message' });
    await input.fill('How many unique visitors did we have yesterday?');
    await input.press('Enter');
    await expect(page).toHaveURL(/\/chat\?.*c=/);
    // The send button comes back once the answer has streamed.
    await expect(
      page.getByRole('button', { name: 'Stop generating' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Send message' })
    ).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByText(/visitors/i).nth(1)).toBeVisible();
    // The list shows the chat under "Today" with a generated title.
    await expect(page.getByText('Today', { exact: true })).toBeVisible();
  });
});

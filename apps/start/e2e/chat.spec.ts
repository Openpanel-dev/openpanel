import {
  type ChatModelEntry,
  MODEL_STORAGE_KEY,
} from '@openpanel/core/modules/assistant/assistant.constants';
import { expect as baseExpect, test } from './fixtures';
import { shot, trpcMutation, trpcQuery } from './org-helpers';

/** The model list the API offers the dashboard, and whether a self-hoster may pick one. */
async function chatModels(page: Parameters<typeof trpcQuery>[0]) {
  return trpcQuery<{
    models: ChatModelEntry[];
    canChooseModel: boolean;
  }>(page, 'chat.models');
}

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

  test('onboarding sends its diagnose question into the chat', async ({
    page,
  }) => {
    // The troubleshooting help only shows while a project has no events.
    const created = await trpcMutation<{ id: string }>(page, 'project.create', {
      organizationId: 'acme',
      project: 'Chat diagnose e2e',
      domain: 'https://diagnose.example.com',
      cors: [],
      website: true,
      app: false,
      backend: false,
    });
    expect(created.status).toBe(200);
    const projectId = created.data?.id ?? '';
    try {
      await page.goto(`/onboarding/${projectId}/connect`, {
        waitUntil: 'networkidle',
      });
      await page.getByText("I'm not receiving events").click();
      await page
        .getByRole('link', { name: 'Diagnose with the assistant' })
        .click();
      await expect(page).toHaveURL(new RegExp(`/acme/${projectId}/chat`));
      expect(new URL(page.url()).searchParams.has('q')).toBe(false);
      const question = page.getByText(/No events have arrived/).first();
      const notConfigured = page.getByText(NOT_CONFIGURED);
      await expect(question.or(notConfigured)).toBeVisible();
      if (!(await notConfigured.isVisible())) {
        // Sent, not just prefilled: the URL settles on the new conversation.
        await expect(page).toHaveURL(/\/chat\?.*c=/);
      }
    } finally {
      await trpcMutation(page, 'project.delete', { projectId });
    }
  });

  test('a ?q= link only prefills the composer', async ({ page }) => {
    await page.goto(`${CHAT}?q=${encodeURIComponent('Export every profile')}`);
    const composer = page.getByRole('textbox', { name: 'Message' });
    const notConfigured = page.getByText(NOT_CONFIGURED);
    await expect(composer.or(notConfigured)).toBeVisible();
    if (await notConfigured.isVisible()) {
      return;
    }
    await expect(composer).toHaveValue('Export every profile');
    await page.waitForTimeout(1000);
    expect(new URL(page.url()).searchParams.has('c')).toBe(false);
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

  // The history of a turn that ran tools is replayed to the model on the next
  // turn; it has to come back from storage exactly as the model produced it.
  // Claude rejects a replayed turn whose stored parts differ from what it
  // produced, so the test runs on Claude whenever the API offers it and on the
  // default model otherwise (the storage round trip matters to both).
  test('a follow-up after a tool-using answer gets an answer', async ({
    page,
  }) => {
    const { models, canChooseModel } = await chatModels(page);
    const claude = canChooseModel
      ? models.find((model) => model.provider === 'anthropic')
      : undefined;
    test.info().annotations.push({
      type: 'model',
      description: claude?.id ?? 'default',
    });
    if (claude) {
      await page.addInitScript(
        ([key, id]) => window.localStorage.setItem(key, id),
        [MODEL_STORAGE_KEY, claude.id]
      );
    }
    await page.goto(CHAT);
    if (await page.getByText(NOT_CONFIGURED).isVisible()) {
      test.skip();
      return;
    }
    if (claude) {
      await expect(
        page.getByRole('button', { name: 'Select model' })
      ).toHaveText(new RegExp(claude.label));
    }
    const input = page.getByRole('textbox', { name: 'Message' });
    const send = page.getByRole('button', { name: 'Send message' });
    await input.fill(
      'Show me the top 3 pages by views in the last 7 days as a bar chart'
    );
    await input.press('Enter');
    await expect(page).toHaveURL(/\/chat\?.*c=/);
    await expect(send).toBeVisible({ timeout: 120_000 });
    // The first answer must have run the chart tool, or the follow-up proves nothing.
    await expect(
      page.getByRole('button', { name: 'Expand chart' }).first()
    ).toBeVisible();

    await input.fill('And which countries do those views come from?');
    await input.press('Enter');
    await expect(
      page.getByRole('button', { name: 'Stop generating' })
    ).toBeVisible();
    await expect(send).toBeVisible({ timeout: 120_000 });
    await shot(page, 'chat-follow-up');
    await expect(
      page.getByText(/Something went wrong|Invalid `signature`/)
    ).toHaveCount(0);
    await expect(page.getByText(/countr/i).nth(1)).toBeVisible();
  });
});

import type { Page } from '@playwright/test';
import { expect as baseExpect, test } from './fixtures';

// The dev server shares a machine with other suites; default timeouts are too tight.
const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ timeout: 240_000 });

const SHOTS = 'test-results/data/shots';
// The seed's SaaS project is the one whose users talk to an assistant.
const SAAS = '/acme/acme-saas';
const NOISE = [
  /api\.openpanel\.dev/,
  /favicon/,
  /sentry/i,
  /\[vite\]/,
  /Failed to load resource/,
  /A tree hydrated but some attributes/,
  /requires a `DialogTitle`/,
];

function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') {
      return;
    }
    const text = message.text();
    if (!NOISE.some((pattern) => pattern.test(text))) {
      problems.push(`console: ${text.slice(0, 400)}`);
    }
  });
  page.on('pageerror', (error) => {
    problems.push(`pageerror: ${error.message.slice(0, 400)}`);
  });
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() >= 400 && !NOISE.some((p) => p.test(url))) {
      problems.push(`http ${response.status()}: ${url.slice(0, 200)}`);
    }
  });
  return problems;
}

async function hydrated(page: Page) {
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('combobox').first()).toContainText('Acme', {
    timeout: 45_000,
  });
}

async function open(page: Page, path: string) {
  await page.context().addCookies([
    {
      name: 'feedback-prompt-seen',
      value: new Date().toISOString(),
      url: process.env.DASHBOARD_URL ?? 'http://localhost:3000',
    },
  ]);
  for (const attempt of [1, 2, 3]) {
    await page.goto(path);
    try {
      await hydrated(page);
      return;
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
    }
  }
}

const tableRows = (page: Page) => page.locator('tbody tr');

test.describe('ai observability', () => {
  test('overview shows cost, tokens and breakdowns for the seeded assistant', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page, `${SAAS}/ai?range=30d`);

    await expect(
      page.getByRole('heading', { name: 'AI', exact: true })
    ).toBeVisible();
    const cards = page.locator('.card').first();
    await expect(cards).toContainText('Cost');
    await expect(cards).toContainText('Generations');
    await expect(cards).toContainText('Latency p95');
    // The seeded SaaS project has four models; the cost widget lists them.
    await expect(page.getByText('Cost by model')).toBeVisible();
    await expect(page.getByText('gpt-5-mini').first()).toBeVisible();
    await expect(page.getByText('claude-sonnet-5-5').first()).toBeVisible();
    await expect(page.getByText('Top users')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/ai-overview.png`, fullPage: true });

    expect(problems).toEqual([]);
  });

  test('traces list opens a trace with its timeline and conversation', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page, `${SAAS}/ai/traces?range=30d`);

    await expect(tableRows(page).first()).toBeVisible();
    await expect(tableRows(page).first()).toContainText('$');
    await page.screenshot({ path: `${SHOTS}/ai-traces.png`, fullPage: true });

    await tableRows(page).first().click();
    await expect(page).toHaveURL(/\/ai\/traces\//);
    await expect(page.getByText('Timeline')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Conversation', exact: true })
    ).toBeVisible();
    // A trace may start with an embedding; pick the model call, whose input
    // carries the seeded assistant's system prompt.
    await page
      .getByRole('button', { name: /gpt-|claude-/ })
      .first()
      .click();
    await expect(
      page.getByText('OpenPanel analytics assistant').first()
    ).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/ai-trace.png`, fullPage: true });

    expect(problems).toEqual([]);
  });

  test('generations open in the event drawer and filters narrow the list', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page, `${SAAS}/ai/generations?range=30d`);

    await expect(tableRows(page).first()).toBeVisible();
    await tableRows(page).first().click();
    const drawer = page.getByRole('complementary', { name: 'Event details' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('Input', { exact: true })).toBeVisible();
    await expect(drawer.getByText('Output', { exact: true })).toBeVisible();
    await page.screenshot({
      path: `${SHOTS}/ai-generation-drawer.png`,
      fullPage: true,
    });

    await page.getByRole('button', { name: 'Errors only' }).click();
    await expect(page).toHaveURL(/errors=true/);
    await expect(tableRows(page).first()).toContainText('429');
    await page.screenshot({
      path: `${SHOTS}/ai-generations-errors.png`,
      fullPage: true,
    });

    expect(problems).toEqual([]);
  });

  test('the AI settings tab toggles content storage', async ({ page }) => {
    const problems = watch(page);
    await open(page, `${SAAS}/settings/ai`);

    const toggle = page.getByRole('switch', {
      name: 'Store prompts and completions',
    });
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expect(page.locator('[data-sonner-toast]')).toContainText(
      'AI settings updated'
    );
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await page.screenshot({ path: `${SHOTS}/ai-settings.png`, fullPage: true });

    expect(problems).toEqual([]);
  });

  test('a profile that used the assistant shows its AI usage', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page, `${SAAS}/ai/traces?range=30d`);
    const profileLink = tableRows(page)
      .first()
      .locator('a[href*="/profiles/"]')
      .first();
    await expect(profileLink).toBeVisible();
    await profileLink.click();
    await expect(page).toHaveURL(/\/profiles\//);
    await expect(page.getByText('AI usage')).toBeVisible();
    await expect(page.getByText('Generations', { exact: true })).toBeVisible();
    await page.screenshot({
      path: `${SHOTS}/ai-profile-usage.png`,
      fullPage: true,
    });

    expect(problems).toEqual([]);
  });
});

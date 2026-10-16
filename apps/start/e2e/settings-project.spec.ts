import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  apiUrl,
  createThrowawayProject,
  gotoHydrated,
  hideFeedbackPrompt,
  LOGGED_OUT,
  recordPageIssues,
  SLOW_ASSERT,
  SLOW_TEST_TIMEOUT_MS,
  scheduleProjectDeletion,
  screenshot,
  seededApi,
  sendTrackEvent,
  type ThrowawayProject,
  trpcMutation,
  trpcQuery,
} from './settings-helpers';

interface ProjectDetails {
  name: string;
  domain: string | null;
  cors: string[];
  crossDomain: boolean;
  allowUnsafeRevenueTracking: boolean;
  filters: { type: string; ip?: string; profileId?: string }[];
  deleteAt: string | null;
}

const DOMAIN = 'https://e2e-settings.example.com';
const FRAMEWORK_COUNT = 15;
/** WCAG AA for large text. */
const MIN_READABLE_CONTRAST = 3;
const AI_CLIENTS = [
  'Claude Desktop',
  'Claude Code (CLI)',
  'Cursor',
  'Windsurf',
  'VS Code (Copilot)',
  'Raycast',
];

let api: APIRequestContext;
let project: ThrowawayProject;
let organizationId: string;

const saveButton = (page: Page) => page.getByRole('button', { name: 'Save' });
const settingsPath = (tab: string) =>
  `/${organizationId}/${project.id}/settings/${tab}`;

async function fetchProject(): Promise<ProjectDetails> {
  const result = await trpcQuery<ProjectDetails>(
    api,
    'project.getProjectWithClients',
    { projectId: project.id }
  );
  if (!result.data) {
    throw new Error(`project not readable: ${result.errorMessage}`);
  }
  return result.data;
}

function resetDetails() {
  return trpcMutation(api, 'project.update', {
    id: project.id,
    name: project.name,
    domain: null,
    cors: [],
    crossDomain: false,
    allowUnsafeRevenueTracking: false,
  });
}

async function addTag(page: Page, placeholder: RegExp, value: string) {
  const input = page.getByPlaceholder(placeholder);
  await input.fill(value);
  await input.press('Enter');
}

test.setTimeout(SLOW_TEST_TIMEOUT_MS);

test.beforeAll(async ({ seed }) => {
  organizationId = seed.organizationId;
  api = await seededApi();
  project = await createThrowawayProject(api, organizationId, 'project');
});

test.afterAll(async () => {
  await scheduleProjectDeletion(api, project.id);
  await api.dispose();
});

test.beforeEach(async ({ context, baseURL }) => {
  await hideFeedbackPrompt(context, baseURL);
});

test.describe('details', () => {
  test.beforeEach(async () => {
    await resetDetails();
  });

  test('name, domain, allowed domains and toggles persist after a reload', async ({
    page,
  }) => {
    const issues = recordPageIssues(page);
    const renamed = `${project.name} renamed`;
    await gotoHydrated(page, settingsPath('details'), saveButton);

    await page.getByLabel('Name').fill(renamed);
    await page.getByRole('switch').click();
    await page.getByPlaceholder('https://example.com').fill(DOMAIN);
    await addTag(page, /Add a domain/, 'allowed.example.com');
    await addTag(page, /Add a domain/, '*');
    await expect(page.getByText('https://allowed.example.com')).toBeVisible();
    await expect(page.getByText('Allow all domains')).toBeVisible();
    await page.getByText('Enable cross domain support').click();
    await page.getByText('Allow "unsafe" revenue tracking').click();
    await saveButton(page).click();
    await expect(page.getByText('Project updated')).toBeVisible(SLOW_ASSERT);

    expect(await fetchProject()).toMatchObject({
      name: renamed,
      domain: DOMAIN,
      cors: ['https://allowed.example.com', '*'],
      crossDomain: true,
      allowUnsafeRevenueTracking: true,
    });

    await page.reload();
    await gotoHydrated(page, settingsPath('details'), saveButton);
    await expect(page.getByLabel('Name')).toHaveValue(renamed);
    await expect(page.getByPlaceholder('https://example.com')).toHaveValue(
      DOMAIN
    );
    await expect(page.getByText('https://allowed.example.com')).toBeVisible();
    await expect(page.getByText('Allow all domains')).toBeVisible();
    await expect(page.getByRole('checkbox').nth(0)).toBeChecked();
    await expect(page.getByRole('checkbox').nth(1)).toBeChecked();
    await expect(page.getByRole('combobox').first()).toContainText(renamed);
    await screenshot(page, 'details-persisted');

    await page.getByRole('switch').click();
    await saveButton(page).click();
    await expect(page.getByText('Project updated')).toBeVisible(SLOW_ASSERT);
    expect(await fetchProject()).toMatchObject({ domain: null, cors: [] });
    issues.expectNone();
  });

  test('a domain without allowed domains, or an invalid domain, is not saved', async ({
    page,
  }) => {
    const updates: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('project.update')) {
        updates.push(request.url());
      }
    });
    await gotoHydrated(page, settingsPath('details'), saveButton);

    await page.getByRole('switch').click();
    await saveButton(page).click();
    await expect(page.getByPlaceholder('https://example.com')).toHaveClass(
      /border-destructive/
    );
    await expect(page.getByText('Issues')).toBeVisible();
    await screenshot(page, 'details-domain-required');

    await page.getByPlaceholder('https://example.com').fill('not a url');
    await addTag(page, /Add a domain/, 'allowed.example.com');
    await saveButton(page).click();
    await expect(page.getByPlaceholder('https://example.com')).toHaveClass(
      /border-destructive/
    );
    expect(updates).toEqual([]);
    expect((await fetchProject()).domain).toBeNull();
  });

  test('an empty name is rejected with a visible error', async ({ page }) => {
    await gotoHydrated(page, settingsPath('details'), saveButton);

    await page.getByLabel('Name').fill('');
    await saveButton(page).click();
    await screenshot(page, 'details-empty-name');
    expect((await fetchProject()).name).toBe(project.name);
    // Nothing is saved, but nothing tells the user why either.
    await expect(
      page.getByText('Issues').or(page.locator('input.border-destructive'))
    ).toBeVisible({ timeout: 5000 });
  });

  test('the same allowed domain cannot be added twice', async ({ page }) => {
    const issues = recordPageIssues(page);
    await gotoHydrated(page, settingsPath('details'), saveButton);

    await page.getByRole('switch').click();
    await page.getByPlaceholder('https://example.com').fill(DOMAIN);
    await addTag(page, /Add a domain/, 'allowed.example.com');
    await addTag(page, /Add a domain/, 'allowed.example.com');
    await addTag(page, /Add a domain/, '*');
    await addTag(page, /Add a domain/, '*');
    // Leaving the field commits whatever is still typed in it.
    await page.getByLabel('Name').click();
    await screenshot(page, 'details-duplicate-allowed-domains');

    await expect(
      page.locator('[data-tag="https://allowed.example.com"]')
    ).toHaveCount(1);
    await expect(page.locator('[data-tag="*"]')).toHaveCount(1);
    issues.expectNone();
  });
});

test.describe('events', () => {
  test('excluded IPs and profile ids persist after a reload', async ({
    page,
  }) => {
    const issues = recordPageIssues(page);
    await gotoHydrated(page, settingsPath('events'), saveButton);

    await addTag(page, /Exclude IP addresses/, '203.0.113.7');
    await addTag(page, /Exclude Profile IDs/, 'e2e-blocked-profile');
    await page.getByRole('button', { name: 'Add event rule' }).click();
    await expect(page.getByText('Select event name...')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add property filter' })
    ).toBeVisible();
    await screenshot(page, 'events-filters-filled');
    await saveButton(page).click();
    await expect(page.getByText('Project filters updated')).toBeVisible(
      SLOW_ASSERT
    );

    expect((await fetchProject()).filters).toEqual([
      { type: 'ip', ip: '203.0.113.7' },
      { type: 'profile_id', profileId: 'e2e-blocked-profile' },
    ]);

    await gotoHydrated(page, settingsPath('events'), saveButton);
    await expect(page.getByText('203.0.113.7')).toBeVisible();
    await expect(page.getByText('e2e-blocked-profile')).toBeVisible();
    issues.expectNone();
  });
});

test.describe('tracking script', () => {
  test('the snippet carries the selected client id and every framework opens its instructions', async ({
    page,
  }) => {
    const issues = recordPageIssues(page);
    const second = await trpcMutation<{ id: string }>(api, 'client.create', {
      name: 'E2E settings second client',
      projectId: project.id,
      organizationId,
      type: 'write',
    });
    const secondId = second.data?.id ?? '';
    const copyButton = (target: Page) =>
      target.getByRole('button', { name: 'Copy', exact: true });
    await gotoHydrated(page, settingsPath('tracking'), copyButton);

    const snippet = page.locator('pre').first();
    await expect(snippet).toContainText(
      `clientId: '${project.clientId}'`,
      SLOW_ASSERT
    );
    await expect(snippet).toContainText('https://openpanel.dev/op1.js');

    await page
      .getByRole('combobox')
      .filter({ hasText: 'First client' })
      .click();
    await page
      .getByRole('option', { name: 'E2E settings second client' })
      .click();
    await expect(snippet).toContainText(`clientId: '${secondId}'`);
    await screenshot(page, 'tracking-second-client');

    const frameworks = page.locator('button:has(.font-semibold)');
    await expect(frameworks).toHaveCount(FRAMEWORK_COUNT);
    const names = await frameworks.allInnerTexts();
    for (const name of names) {
      await page.getByRole('button', { name, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.locator('iframe')).toHaveAttribute(
        'src',
        /^https:\/\//
      );
      await expect(
        dialog.getByRole('link', { name: 'More details' })
      ).toBeVisible();
      await dialog.getByRole('button', { name: 'Close' }).first().click();
      await expect(dialog).toBeHidden();
    }
    // Both have a test of their own below.
    const coveredElsewhere = /DialogTitle|Framing/;
    expect(
      issues.list.filter((issue) => !coveredElsewhere.test(issue))
    ).toEqual([]);
  });

  test('the instructions sheet has an accessible title', async ({ page }) => {
    const issues = recordPageIssues(page);
    const copyButton = (target: Page) =>
      target.getByRole('button', { name: 'Copy', exact: true });
    await gotoHydrated(page, settingsPath('tracking'), copyButton);

    await page.getByRole('button', { name: 'React', exact: true }).click();
    await expect(page.getByRole('dialog').locator('iframe')).toBeVisible();
    await expect(
      page.getByRole('dialog', { name: 'Instructions for React' })
    ).toBeVisible({ timeout: 5000 });
    issues.expectNone();
  });

  test('every framework page is allowed to load inside the instructions sheet', async ({
    page,
  }) => {
    const blockedFrames: string[] = [];
    page.on('console', (message) => {
      if (/Framing|frame-ancestors|X-Frame-Options/.test(message.text())) {
        blockedFrames.push(message.text());
      }
    });
    const copyButton = (target: Page) =>
      target.getByRole('button', { name: 'Copy', exact: true });
    await gotoHydrated(page, settingsPath('tracking'), copyButton);

    // The only framework whose instructions live outside openpanel.dev.
    await page.getByRole('button', { name: 'Laravel', exact: true }).click();
    const frame = page.getByRole('dialog').locator('iframe');
    await expect(frame).toBeVisible();
    await page.waitForLoadState('networkidle');
    await screenshot(page, 'tracking-instructions-laravel');
    expect(blockedFrames).toEqual([]);
  });
});

test.describe('mcp', () => {
  test('the endpoint and client snippets point at the API, and the endpoint answers tools/list', async ({
    page,
    seed,
  }) => {
    const issues = recordPageIssues(page);
    const endpoint = `${apiUrl()}/mcp`;
    const createButton = (target: Page) =>
      target.getByRole('button', { name: 'Create MCP client' });
    await gotoHydrated(page, settingsPath('mcp'), createButton);

    await expect(page.getByText(endpoint, { exact: true })).toBeVisible();
    for (const name of AI_CLIENTS) {
      await page.getByRole('button', { name, exact: true }).click();
      const panel = page.getByRole('region', { name });
      await expect(panel.locator('pre')).toContainText(endpoint);
      await expect(panel.locator('pre')).toContainText('BASE64_TOKEN');
    }
    await screenshot(page, 'mcp');

    const token = Buffer.from(
      `${seed.rootClient.id}:${seed.rootClient.secret}`
    ).toString('base64');
    const viaHeader = await api.post(endpoint, {
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${token}`,
      },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(viaHeader.status()).toBe(200);
    expect((await viaHeader.json()).result.tools.length).toBeGreaterThan(0);

    const noToken = await api.post(endpoint, {
      headers: { accept: 'application/json, text/event-stream' },
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    });
    expect(noToken.status()).toBe(401);
    issues.expectNone();
  });

  test('"Create MCP client" offers a client type that can use MCP', async ({
    page,
  }) => {
    const createButton = (target: Page) =>
      target.getByRole('button', { name: 'Create MCP client' });
    await gotoHydrated(page, settingsPath('mcp'), createButton);

    await createButton(page).click();
    const dialog = page.getByRole('dialog');
    await screenshot(page, 'mcp-create-client');
    // The page says only read and root clients can authenticate with MCP.
    await expect(dialog.getByRole('combobox')).not.toContainText('Write');
  });
});

test.describe('widgets', () => {
  test('widgets can be enabled, configured and are public while enabled', async ({
    page,
    browser,
  }) => {
    const issues = recordPageIssues(page);
    await sendTrackEvent(
      api,
      { id: project.clientId, secret: project.clientSecret },
      'screen_view',
      { __path: '/pricing', __referrer: 'https://google.com' }
    );
    const firstSwitch = (target: Page) => target.getByRole('switch').first();
    await gotoHydrated(page, settingsPath('widgets'), firstSwitch);
    await expect(page.getByRole('switch')).toHaveCount(2);
    await expect(page.getByText('Widget URL')).toHaveCount(0);

    await page.getByRole('switch').first().click();
    await expect(page.getByText('Widget enabled')).toBeVisible(SLOW_ASSERT);
    const realtime = await trpcQuery<{ id: string }>(api, 'widget.get', {
      projectId: project.id,
      type: 'realtime',
    });
    const realtimePath = `/widget/realtime?shareId=${realtime.data?.id}`;
    await expect(page.locator('pre').first()).toContainText(realtimePath);

    await page.getByLabel('Show Paths').click();
    await expect(page.getByText('Widget options updated')).toBeVisible(
      SLOW_ASSERT
    );
    await gotoHydrated(page, settingsPath('widgets'), firstSwitch);
    await expect(page.getByLabel('Show Paths')).toBeChecked();
    await expect(page.getByLabel('Show Referrers')).toBeChecked();

    await page.getByRole('switch').last().click();
    await expect(page.getByText('Widget enabled')).toBeVisible(SLOW_ASSERT);
    const counter = await trpcQuery<{ id: string }>(api, 'widget.get', {
      projectId: project.id,
      type: 'counter',
    });
    const counterPath = `/widget/counter?shareId=${counter.data?.id}`;
    const badgePath = `/widget/badge?shareId=${counter.data?.id}`;
    await expect(
      page.getByText('Analytics Badge', { exact: true })
    ).toBeVisible();
    await expect(page.locator('pre').nth(1)).toContainText(counterPath);
    await expect(page.locator('pre').nth(2)).toContainText(badgePath);
    await screenshot(page, 'widgets-enabled');

    const loggedOut = await browser.newContext(LOGGED_OUT);
    const visitor = await loggedOut.newPage();
    await visitor.goto(realtimePath);
    await expect(visitor.getByText('USERS IN LAST 30 MINUTES')).toBeVisible(
      SLOW_ASSERT
    );
    await expect(visitor.getByText('/pricing')).toBeVisible(SLOW_ASSERT);
    await expect(visitor.getByText('Google')).toBeVisible();
    await visitor.screenshot({
      path: 'test-results/settings/shots/widget-public-realtime.png',
    });

    await visitor.goto(counterPath);
    await expect(visitor.getByText('unique visitors').first()).toBeVisible(
      SLOW_ASSERT
    );
    await visitor.goto(badgePath);
    await expect(visitor.getByText('ANALYTICS FROM')).toBeVisible(SLOW_ASSERT);
    await visitor.goto('/widget/counter');
    await expect(
      visitor.getByText('Missing or invalid widget link.')
    ).toBeVisible(SLOW_ASSERT);

    await page.getByRole('switch').first().click();
    await expect(page.getByText('Widget disabled')).toBeVisible(SLOW_ASSERT);
    await visitor.goto(realtimePath);
    await expect(visitor.getByText('Widget not found')).toBeVisible(
      SLOW_ASSERT
    );
    await loggedOut.close();
    issues.expectNone();
  });

  test('the badge is readable with the embed code the settings page hands out', async ({
    browser,
  }) => {
    await trpcMutation(api, 'widget.toggle', {
      projectId: project.id,
      organizationId,
      type: 'counter',
      enabled: true,
    });
    const counter = await trpcQuery<{ id: string }>(api, 'widget.get', {
      projectId: project.id,
      type: 'counter',
    });
    const loggedOut = await browser.newContext(LOGGED_OUT);
    const visitor = await loggedOut.newPage();
    await visitor.goto(`/widget/badge?shareId=${counter.data?.id}`);
    const label = visitor.getByText('OpenPanel', { exact: true });
    await expect(label).toBeVisible(SLOW_ASSERT);
    await visitor.screenshot({
      path: 'test-results/settings/shots/widget-public-badge.png',
    });

    const contrast = await label.evaluate((element) => {
      const transparent = /^rgba\(0, 0, 0, 0\)$|^transparent$/;
      let background = 'transparent';
      for (
        let node: Element | null = element;
        node && transparent.test(background);
        node = node.parentElement
      ) {
        background = getComputedStyle(node).backgroundColor;
      }
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d');
      const luminance = (color: string) => {
        if (!context) {
          return 0;
        }
        // Painting over white resolves any CSS color syntax, and a
        // transparent chain to the browser's default white canvas.
        context.fillStyle = '#fff';
        context.fillRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [red = 0, green = 0, blue = 0] = context.getImageData(
          0,
          0,
          1,
          1
        ).data;
        const channel = (value: number) => {
          const unit = value / 255;
          return unit <= 0.039_28
            ? unit / 12.92
            : ((unit + 0.055) / 1.055) ** 2.4;
        };
        return (
          0.2126 * channel(red) +
          0.7152 * channel(green) +
          0.0722 * channel(blue)
        );
      };
      const text = luminance(getComputedStyle(element).color);
      const surface = luminance(background);
      return (
        (Math.max(text, surface) + 0.05) / (Math.min(text, surface) + 0.05)
      );
    });
    await loggedOut.close();
    // The default link sets no `color`, so the white label sits on the page.
    expect(contrast).toBeGreaterThan(MIN_READABLE_CONTRAST);
  });
});

test.describe('imports', () => {
  const importButtons = (page: Page) =>
    page.getByRole('button', { name: 'Import Data' });

  const PROVIDERS = ['Umami', 'Mixpanel', 'Amplitude'] as const;

  async function openImport(page: Page, provider: (typeof PROVIDERS)[number]) {
    await importButtons(page).nth(PROVIDERS.indexOf(provider)).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(`Import from ${provider}`)).toBeVisible();
    return dialog;
  }

  test('every provider modal validates before starting an import', async ({
    page,
  }) => {
    const issues = recordPageIssues(page);
    const created: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('import.create')) {
        created.push(request.url());
      }
    });
    await gotoHydrated(page, settingsPath('imports'), importButtons);
    await expect(importButtons(page)).toHaveCount(3);
    await expect(page.getByText('No imports yet')).toBeVisible(SLOW_ASSERT);

    const umami = await openImport(page, 'Umami');
    await umami.getByRole('button', { name: 'Start Import' }).click();
    await expect(umami.getByText('Issues')).toHaveCount(1);
    await umami.getByLabel('File URL').fill('ftp://example.com/export.csv');
    await umami.getByRole('button', { name: 'Start Import' }).click();
    await expect(umami.getByText('Issues')).toHaveCount(1);
    await umami.getByRole('button', { name: 'Cancel' }).click();

    const mixpanel = await openImport(page, 'Mixpanel');
    await mixpanel.getByRole('button', { name: 'Start Import' }).click();
    await expect(mixpanel.getByText('Issues')).toHaveCount(3);
    await screenshot(page, 'imports-mixpanel-validation');
    await mixpanel.getByRole('button', { name: 'Cancel' }).click();

    const amplitude = await openImport(page, 'Amplitude');
    await amplitude.getByRole('button', { name: 'Start Import' }).click();
    await expect(amplitude.getByText('Issues')).toHaveCount(2);
    await amplitude.getByRole('button', { name: 'Cancel' }).click();

    expect(created).toEqual([]);
    issues.expectNone();
  });

  test('a missing date range is reported in the Mixpanel modal', async ({
    page,
  }) => {
    await gotoHydrated(page, settingsPath('imports'), importButtons);
    const mixpanel = await openImport(page, 'Mixpanel');
    await mixpanel.getByLabel('Service Account').fill('e2e.service-account');
    await mixpanel.getByLabel('Service Secret').fill('not-a-real-secret');
    await mixpanel.getByLabel('Project ID').fill('123456');
    await mixpanel.getByRole('button', { name: 'Start Import' }).click();
    await screenshot(page, 'imports-mixpanel-no-date-range');
    // The submit is blocked by the empty range, so the modal has to say so.
    await expect(mixpanel.getByText('Issues')).toBeVisible({ timeout: 5000 });
  });

  test('an incomplete project mapping is reported in the Umami modal', async ({
    page,
  }) => {
    await gotoHydrated(page, settingsPath('imports'), importButtons);
    const umami = await openImport(page, 'Umami');
    await umami.getByLabel('File URL').fill('https://example.com/export.csv');
    await umami.getByRole('button', { name: 'Add Mapping' }).click();
    await umami.getByRole('button', { name: 'Start Import' }).click();
    await screenshot(page, 'imports-umami-empty-mapping');
    await expect(umami).toBeVisible();
    await expect(
      umami.getByText('Issues').or(umami.locator('.border-destructive'))
    ).toBeVisible({ timeout: 5000 });
  });

  test('a file import that cannot be fetched fails, can be retried and deleted', async ({
    page,
  }) => {
    const issues = recordPageIssues(page);
    await gotoHydrated(page, settingsPath('imports'), importButtons);
    const umami = await openImport(page, 'Umami');
    // Loopback is refused by the worker, so this never leaves the machine.
    await umami.getByLabel('File URL').fill('http://127.0.0.1:9/umami.csv');
    await umami.getByRole('button', { name: 'Start Import' }).click();
    await expect(page.getByText('Import started')).toBeVisible(SLOW_ASSERT);
    await expect(umami).toBeHidden();

    const row = page.getByRole('row', { name: /umami/i });
    await expect(row.getByText('failed', { exact: true })).toBeVisible(
      SLOW_ASSERT
    );
    await screenshot(page, 'imports-failed');
    await row.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByText('Import retried')).toBeVisible(SLOW_ASSERT);
    await expect(row.getByText('failed', { exact: true })).toBeVisible(
      SLOW_ASSERT
    );

    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Import deleted')).toBeVisible(SLOW_ASSERT);
    await expect(page.getByText('No imports yet')).toBeVisible(SLOW_ASSERT);
    issues.expectNone();
  });
});

test.describe('danger zone', () => {
  test('a project is scheduled for deletion, can be restored, and is flagged or gone on the projects page', async ({
    page,
  }) => {
    const issues = recordPageIssues(page);
    const doomed = await createThrowawayProject(api, organizationId, 'danger');
    const readDeleteAt = async () =>
      (
        await trpcQuery<ProjectDetails>(api, 'project.getProjectWithClients', {
          projectId: doomed.id,
        })
      ).data?.deleteAt ?? null;
    const deleteButton = (target: Page) =>
      target.getByRole('button', { name: 'Delete Project' });
    await gotoHydrated(
      page,
      `/${organizationId}/${doomed.id}/settings/details`,
      deleteButton
    );

    await deleteButton(page).click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByText('Are you sure you want to delete this project?')
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    expect(await readDeleteAt()).toBeNull();

    await deleteButton(page).click();
    await dialog.getByRole('button', { name: 'Yes' }).click();
    await expect(page.getByText('Project scheduled for deletion')).toBeVisible(
      SLOW_ASSERT
    );
    await expect(deleteButton(page)).toBeDisabled();
    await screenshot(page, 'danger-scheduled');
    const deleteAt = await readDeleteAt();
    const hoursUntilDeletion =
      (new Date(deleteAt ?? 0).getTime() - Date.now()) / 3_600_000;
    expect(hoursUntilDeletion).toBeGreaterThan(23);
    expect(hoursUntilDeletion).toBeLessThan(25);

    await page.getByRole('button', { name: 'Cancel deletion' }).click();
    await expect(page.getByText('Project deletion cancelled')).toBeVisible(
      SLOW_ASSERT
    );
    await expect(page.getByText('Project scheduled for deletion')).toBeHidden();
    await expect(deleteButton(page)).toBeEnabled();
    expect(await readDeleteAt()).toBeNull();

    await deleteButton(page).click();
    await dialog.getByRole('button', { name: 'Yes' }).click();
    await expect(page.getByText('Project scheduled for deletion')).toBeVisible(
      SLOW_ASSERT
    );
    issues.expectNone();

    const search = (target: Page) => target.getByPlaceholder('Search');
    await gotoHydrated(page, `/${organizationId}`, search);
    await search(page).fill(doomed.name);
    const card = page.locator('a').filter({ hasText: doomed.name });
    const isStillListed = await card
      .first()
      .waitFor({ timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    await screenshot(page, 'danger-projects-page');
    if (isStillListed) {
      // Listed for another 24 hours: it has to say it is on its way out.
      await expect(card.first()).toContainText(/delet/i, { timeout: 5000 });
    }
  });
});

test.describe('mobile viewport', () => {
  const MOBILE = { width: 390, height: 844 };
  const PAGES = [
    'settings/details',
    'settings/events',
    'settings/clients',
    'settings/tracking',
    'settings/mcp',
    'settings/widgets',
    'settings/imports',
    'notifications/rules',
    'integrations/available',
  ];

  for (const path of PAGES) {
    test(`${path} fits a 390px wide screen`, async ({ page }) => {
      await page.setViewportSize(MOBILE);
      await page.goto(`/${organizationId}/${project.id}/${path}`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('tab').first()).toBeVisible(SLOW_ASSERT);
      await screenshot(page, `mobile-${path.replace('/', '-')}`);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow, 'horizontal page overflow in px').toBeLessThanOrEqual(0);
    });
  }
});

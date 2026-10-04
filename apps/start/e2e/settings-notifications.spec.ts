import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  createThrowawayProject,
  gotoHydrated,
  hideFeedbackPrompt,
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

interface Rule {
  id: string;
  name: string;
  sendToApp: boolean;
  template: string | null;
  config: { type: string; events: { name: string }[] };
  integrations: { id: string; name: string }[];
}

interface Integration {
  id: string;
  name: string;
  config: { type: string; url?: string; headers?: Record<string, string> };
}

const TRIGGER_EVENT = 'e2e_rule_trigger';
const RULE_NAME = 'E2E settings event rule';
const TEMPLATE =
  'E2E {{name}} on {{path}} plan={{properties.plan}} rule={{rule_name}} / $RULE_NAME / $EVENT_NAME';
const RENDERED_TITLE = `E2E ${TRIGGER_EVENT} on /pricing plan=pro rule=${RULE_NAME} / ${RULE_NAME} / ${TRIGGER_EVENT}`;
const TEMPLATE_VARIABLES = [
  '{{name}}',
  '{{rule_name}}',
  '{{properties.your.property}}',
  '{{profile.firstName}}',
  'profileId',
  'createdAt',
  'country',
  'city',
  'os',
  'osVersion',
  'browser',
  'browserVersion',
  'device',
  'brand',
  'model',
  'path',
  'origin',
  'referrer',
  'referrerName',
  'referrerType',
];
const PROVIDERS = [
  { name: 'Slack', requiredFields: 1 },
  { name: 'Discord', requiredFields: 2 },
  { name: 'Webhook', requiredFields: 2 },
  { name: 'S3 Export', requiredFields: 3 },
  { name: 'GCS Export', requiredFields: 2 },
];
const DELIVERY_POLL = { timeout: 90_000, intervals: [3000] };

let api: APIRequestContext;
let project: ThrowawayProject;
let organizationId: string;

const projectPath = (path: string) =>
  `/${organizationId}/${project.id}/${path}`;
const addRuleButton = (page: Page) =>
  page.getByRole('button', { name: 'Add Rule' }).first();
const client = () => ({ id: project.clientId, secret: project.clientSecret });

async function fetchRules(): Promise<Rule[]> {
  const rules = await trpcQuery<Rule[]>(api, 'notification.rules', {
    projectId: project.id,
  });
  return rules.data ?? [];
}

async function pickEvent(page: Page, index: number, eventName: string) {
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('combobox')
    .nth(index + 1)
    .click();
  await page.getByPlaceholder('Search event...').fill(eventName);
  await page.getByRole('option', { name: eventName }).first().click();
}

async function pickIntegration(page: Page, name: string) {
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Pick integrations|Website|E2E/ })
    .last()
    .click();
  await page.getByRole('option', { name }).click();
  await page.keyboard.press('Escape');
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(SLOW_TEST_TIMEOUT_MS);

test.beforeAll(async ({ seed }) => {
  organizationId = seed.organizationId;
  api = await seededApi();
  project = await createThrowawayProject(api, organizationId, 'notifications');
  // The rule modal only offers event names the project has already received.
  const seeded = await sendTrackEvent(api, client(), TRIGGER_EVENT, {
    __path: '/pricing',
  });
  expect(seeded.status()).toBe(200);
  await expect
    .poll(async () => {
      const names = await trpcQuery<{ name: string }[]>(api, 'chart.events', {
        projectId: project.id,
      });
      return JSON.stringify(names.data ?? names.errorMessage);
    }, DELIVERY_POLL)
    .toContain(TRIGGER_EVENT);
});

test.afterAll(async () => {
  await scheduleProjectDeletion(api, project.id);
  await api.dispose();
});

test.beforeEach(async ({ context, baseURL }) => {
  await hideFeedbackPrompt(context, baseURL);
});

test('both notification tabs render their empty state', async ({ page }) => {
  const issues = recordPageIssues(page);
  await gotoHydrated(page, projectPath('notifications'), (target) =>
    target.getByRole('tab', { name: 'Rules' })
  );
  await expect(page).toHaveURL(/notifications\/notifications$/);
  await expect(page.getByText('No data')).toBeVisible(SLOW_ASSERT);

  await page.getByRole('tab', { name: 'Rules' }).click();
  await expect(page).toHaveURL(/notifications\/rules$/);
  await expect(page.getByText('No rules yet')).toBeVisible(SLOW_ASSERT);
  await screenshot(page, 'rules-empty');

  await page.goBack();
  await expect(page).toHaveURL(/notifications\/notifications$/);
  issues.expectNone();
});

test('the rule modal validates, lists every template variable and creates an event rule', async ({
  page,
}) => {
  const issues = recordPageIssues(page);
  await gotoHydrated(page, projectPath('notifications/rules'), addRuleButton);
  await addRuleButton(page).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Create rule')).toBeVisible();

  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog.getByText('Issues', { exact: true })).toBeVisible();

  await dialog.getByLabel('Rule name').fill(RULE_NAME);
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('At least one event is required')).toBeVisible();
  expect(await fetchRules()).toEqual([]);

  await dialog.getByRole('combobox').first().click();
  await expect(page.getByRole('option')).toHaveText(['Events', 'Funnel']);
  await page.keyboard.press('Escape');

  await dialog.getByText('Template').locator('svg').hover();
  const tooltip = page.getByRole('tooltip');
  for (const variable of TEMPLATE_VARIABLES) {
    await expect(
      tooltip.getByText(variable, { exact: true }).first()
    ).toBeVisible();
  }
  await screenshot(page, 'rules-template-variables');
  // The tooltip covers the event picker until the pointer acts elsewhere.
  await dialog.getByText('Create rule').click();
  await page.mouse.move(5, 5, { steps: 5 });
  await expect(tooltip).toBeHidden();

  await pickEvent(page, 0, TRIGGER_EVENT);
  await dialog.getByPlaceholder(/You received a new/).fill(TEMPLATE);
  await pickIntegration(page, 'Website');
  await screenshot(page, 'rules-modal-filled');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Notification rule created')).toBeVisible(
    SLOW_ASSERT
  );
  await expect(dialog).toBeHidden();

  const card = page.locator('.card').filter({ hasText: RULE_NAME });
  await expect(card).toContainText('Get notified when');
  await expect(card).toContainText(TRIGGER_EVENT);
  await expect(card).toContainText('Website');
  const [rule] = await fetchRules();
  expect(rule).toMatchObject({
    name: RULE_NAME,
    sendToApp: true,
    template: TEMPLATE,
    config: { type: 'events', events: [{ name: TRIGGER_EVENT }] },
  });
  // Opening the event picker logs a React list-key warning; reported separately.
  expect(
    issues.list.filter((issue) => !issue.includes('unique "key"'))
  ).toEqual([]);
});

test('a matching event produces an in-app notification with the template filled in', async ({
  page,
}) => {
  const issues = recordPageIssues(page);
  await gotoHydrated(
    page,
    projectPath('notifications/notifications'),
    (target) => target.getByRole('tab', { name: 'Rules' })
  );
  // The dashboard listens on a websocket and toasts new notifications.
  await page.waitForTimeout(2000);

  const sent = await sendTrackEvent(api, client(), TRIGGER_EVENT, {
    __path: '/pricing',
    plan: 'pro',
  });
  expect(sent.status()).toBe(200);
  const unrelated = await sendTrackEvent(api, client(), 'e2e_unrelated_event');
  expect(unrelated.status()).toBe(200);

  await expect(page.getByText(RENDERED_TITLE).first()).toBeVisible(
    DELIVERY_POLL
  );
  await screenshot(page, 'notification-toast');

  await expect(async () => {
    await page.reload();
    await expect(
      page.getByRole('row', { name: new RegExp(RULE_NAME) }).first()
    ).toBeVisible({ timeout: 10_000 });
  }).toPass(DELIVERY_POLL);
  const row = page.getByRole('row').filter({ hasText: RENDERED_TITLE });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Chrome');
  await screenshot(page, 'notifications-list');

  await page.getByPlaceholder('Search').fill('no such notification');
  await expect(row).toHaveCount(0);
  await page.getByPlaceholder('Search').fill('plan=pro');
  await expect(row).toHaveCount(1);
  // The table logs a React setState-in-render warning; reported separately.
  expect(
    issues.list.filter((issue) => !issue.includes('Cannot update a component'))
  ).toEqual([]);
});

test('a rule can be edited into a funnel and keeps its integration', async ({
  page,
}) => {
  const renamed = 'E2E settings funnel rule';
  await gotoHydrated(page, projectPath('notifications/rules'), addRuleButton);
  const card = page.locator('.card').filter({ hasText: RULE_NAME });
  await card.getByRole('button', { name: 'Edit' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Edit rule')).toBeVisible();
  await expect(dialog.getByLabel('Rule name')).toHaveValue(RULE_NAME);
  await expect(dialog.getByPlaceholder(/You received a new/)).toHaveValue(
    TEMPLATE
  );

  await dialog.getByLabel('Rule name').fill(renamed);
  await dialog.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Funnel' }).click();
  await dialog.getByRole('button', { name: 'Add event' }).click();
  await pickEvent(page, 1, 'session_start');
  await screenshot(page, 'rules-modal-funnel');
  await dialog.getByRole('button', { name: 'Update' }).click();
  await expect(page.getByText('Notification rule updated')).toBeVisible(
    SLOW_ASSERT
  );

  const updated = page.locator('.card').filter({ hasText: renamed });
  await expect(updated).toContainText(
    'Get notified when a session has completed this funnel'
  );
  await expect(updated).toContainText('Website');
  const [rule] = await fetchRules();
  expect(rule).toMatchObject({
    name: renamed,
    sendToApp: true,
    config: {
      type: 'funnel',
      events: [{ name: TRIGGER_EVENT }, { name: 'session_start' }],
    },
  });
});

test('a rule is deleted after confirmation', async ({ page }) => {
  const issues = recordPageIssues(page);
  await gotoHydrated(page, projectPath('notifications/rules'), addRuleButton);
  const card = page.locator('.card').filter({ hasText: 'E2E settings' });
  await card.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: 'Delete' }).click();
  await dialog.getByRole('button', { name: 'Yes' }).click();
  await expect(page.getByText('Rule deleted')).toBeVisible(SLOW_ASSERT);
  await expect(page.getByText('No rules yet')).toBeVisible(SLOW_ASSERT);
  expect(await fetchRules()).toEqual([]);
  // The funnel card renders its events without keys; reported separately.
  expect(
    issues.list.filter((issue) => !issue.includes('unique "key"'))
  ).toEqual([]);
});

test('every available integration opens a form that validates', async ({
  page,
}) => {
  const issues = recordPageIssues(page);
  const connectButtons = (target: Page) =>
    target.getByRole('button', { name: 'Connect' });
  await gotoHydrated(page, projectPath('integrations'), (target) =>
    target.getByRole('tab', { name: 'Available' })
  );
  await expect(page).toHaveURL(/integrations\/installed$/);
  await expect(page.getByText('No integrations yet')).toBeVisible(SLOW_ASSERT);

  await page.getByRole('tab', { name: 'Available' }).click();
  await expect(connectButtons(page)).toHaveCount(PROVIDERS.length);
  for (const [index, provider] of PROVIDERS.entries()) {
    await connectButtons(page).nth(index).click();
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByText(provider.name, { exact: true }).first()
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog.getByText('Issues', { exact: true })).toHaveCount(
      provider.requiredFields
    );
    await screenshot(page, `integration-validation-${provider.name}`);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
  }

  const integrations = await trpcQuery<Integration[]>(api, 'integration.list', {
    projectId: project.id,
  });
  expect(integrations.data?.map((integration) => integration.id)).toEqual([
    'app',
    'email',
  ]);
  issues.expectNone();
});

test.describe('webhook integration', () => {
  let listener: Server;
  let listenerUrl: string;
  const received: string[] = [];

  test.beforeAll(async () => {
    listener = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        received.push(body);
        response.writeHead(200).end('ok');
      });
    });
    await new Promise<void>((resolve) =>
      listener.listen(0, '127.0.0.1', resolve)
    );
    const { port } = listener.address() as AddressInfo;
    listenerUrl = `http://127.0.0.1:${port}/hook`;
  });

  test.afterAll(() => {
    listener.close();
  });

  test('a webhook is created, hides its header value, is edited and deleted', async ({
    page,
  }) => {
    const issues = recordPageIssues(page);
    const name = 'E2E settings webhook';
    await gotoHydrated(page, projectPath('integrations/available'), (target) =>
      target.getByRole('button', { name: 'Connect' }).first()
    );
    await page.getByRole('button', { name: 'Connect' }).nth(2).click();
    const dialog = page.getByRole('dialog');

    await dialog.getByLabel('Name').fill(name);
    await dialog.getByLabel('URL').fill('not a url');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog.getByText('Issues', { exact: true })).toHaveCount(1);

    await dialog.getByLabel('URL').fill(listenerUrl);
    await dialog.getByRole('button', { name: 'Add Header' }).click();
    await dialog.getByPlaceholder('Header Name').fill('x-e2e-auth');
    await dialog.getByPlaceholder('Header Value').fill('super-secret-value');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('Integration created')).toBeVisible(
      SLOW_ASSERT
    );
    await expect(page).toHaveURL(/integrations\/installed$/);

    const card = page.locator('.card').filter({ hasText: name });
    await expect(card).toContainText('Connected');
    await screenshot(page, 'integrations-installed');
    const listed = await trpcQuery<Integration[]>(api, 'integration.list', {
      projectId: project.id,
    });
    const webhook = listed.data?.find(
      (integration) => integration.name === name
    );
    expect(webhook?.config).toMatchObject({
      type: 'webhook',
      url: listenerUrl,
    });
    expect(JSON.stringify(listed.data)).not.toContain('super-secret-value');

    await card.getByRole('button', { name: 'Edit' }).click();
    await expect(dialog.getByLabel('Name')).toHaveValue(name);
    await expect(dialog.getByLabel('URL')).toHaveValue(listenerUrl);
    await expect(dialog.getByPlaceholder('Header Name')).toHaveValue(
      'x-e2e-auth'
    );
    await expect(dialog.getByPlaceholder('Unchanged')).toHaveValue('');
    await dialog.getByLabel('Name').fill(`${name} edited`);
    await dialog.getByRole('button', { name: 'Update' }).click();
    await expect(dialog).toBeHidden(SLOW_ASSERT);
    const edited = page.locator('.card').filter({ hasText: `${name} edited` });
    await expect(edited).toBeVisible(SLOW_ASSERT);

    // Loopback targets are refused by the worker, so a rule pointing here
    // must not reach the listener.
    const rule = await trpcMutation(api, 'notification.createOrUpdateRule', {
      name: 'E2E settings webhook rule',
      projectId: project.id,
      integrations: [webhook?.id],
      sendToApp: false,
      sendToEmail: false,
      config: {
        type: 'events',
        events: [{ name: TRIGGER_EVENT, segment: 'event', filters: [] }],
      },
    });
    expect(rule.status).toBe(200);
    await sendTrackEvent(api, client(), TRIGGER_EVENT, { __path: '/pricing' });
    await page.waitForTimeout(10_000);
    expect(received).toEqual([]);

    await edited.getByRole('button', { name: 'Delete' }).click();
    await dialog.getByRole('button', { name: 'Yes' }).click();
    await expect(page.getByText('No integrations yet')).toBeVisible(
      SLOW_ASSERT
    );
    issues.expectNone();
  });
});

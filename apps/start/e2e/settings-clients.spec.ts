import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  apiUrl,
  createThrowawayProject,
  gotoHydrated,
  recordPageIssues,
  SLOW_ASSERT,
  SLOW_TEST_TIMEOUT_MS,
  scheduleProjectDeletion,
  screenshot,
  seededApi,
  sendTrackEvent,
  type ThrowawayProject,
  trpcQuery,
} from './settings-helpers';

const CLIENT_TYPES = ['write', 'read', 'root'] as const;
type ClientType = (typeof CLIENT_TYPES)[number];
const TYPE_LABELS: Record<ClientType, string> = {
  write: 'Write (for ingestion)',
  read: 'Read (access export API)',
  root: 'Root (access export API)',
};
const INGEST_POLL = { timeout: 120_000, intervals: [3000] };

interface Credentials {
  id: string;
  secret: string;
  mcpToken: string | null;
}

let api: APIRequestContext;
let project: ThrowawayProject;
const created = {} as Record<ClientType, Credentials>;

const clientName = (type: ClientType) => `E2E settings ${type} client`;
const createClientButton = (page: Page) =>
  page.getByRole('button', { name: 'Create client' });

function listTools(token: string) {
  return api.post(`${apiUrl()}/mcp?token=${token}`, {
    headers: { accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  });
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(SLOW_TEST_TIMEOUT_MS);

test.beforeAll(async ({ seed }) => {
  api = await seededApi();
  project = await createThrowawayProject(api, seed.organizationId, 'clients');
});

test.afterAll(async () => {
  await scheduleProjectDeletion(api, project.id);
  await api.dispose();
});

test('the create client modal requires a name', async ({ page, seed }) => {
  const issues = recordPageIssues(page);
  await gotoHydrated(
    page,
    `/${seed.organizationId}/${project.id}/settings/clients`,
    createClientButton
  );
  await expect(page.getByText('First client')).toBeVisible(SLOW_ASSERT);

  await createClientButton(page).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(dialog.getByPlaceholder('Eg. My App Client')).toHaveClass(
    /border-destructive/
  );
  await expect(dialog.getByText('Your client is created')).toBeHidden();
  await screenshot(page, 'clients-create-empty-name');

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  issues.expectNone();
});

for (const type of CLIENT_TYPES) {
  test(`a ${type} client is created and its secret is shown once`, async ({
    page,
    context,
    seed,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const issues = recordPageIssues(page);
    await gotoHydrated(
      page,
      `/${seed.organizationId}/${project.id}/settings/clients`,
      createClientButton
    );

    await createClientButton(page).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('Eg. My App Client').fill(clientName(type));
    if (type !== 'write') {
      await dialog.getByRole('combobox').click();
      await page.getByRole('option', { name: TYPE_LABELS[type] }).click();
    }
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog.getByText('Your client is created')).toBeVisible(
      SLOW_ASSERT
    );
    await screenshot(page, `clients-created-${type}`);

    await dialog.getByRole('button', { name: 'Copy all' }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const id = copied.match(/^CLIENT_ID=(.+)$/m)?.[1] ?? '';
    const secret = copied.match(/^CLIENT_SECRET=(.+)$/m)?.[1] ?? '';
    const mcpToken = copied.match(/^MCP_TOKEN=(.+)$/m)?.[1] ?? null;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(secret).toMatch(/^sec_[0-9a-f]+$/);
    await expect(dialog.getByText(id)).toBeVisible();
    await expect(dialog.getByText(secret)).toBeVisible();

    if (type === 'write') {
      expect(mcpToken).toBeNull();
      await expect(dialog.getByText('MCP Token')).toBeHidden();
    } else {
      expect(mcpToken).toBe(Buffer.from(`${id}:${secret}`).toString('base64'));
      await expect(dialog.getByText('MCP Token')).toBeVisible();
    }
    created[type] = { id, secret, mcpToken };

    await dialog.getByRole('button', { name: 'Close' }).last().click();
    await expect(dialog).toBeHidden();
    const row = page.getByRole('row', { name: clientName(type) });
    await expect(row).toContainText(id);
    await expect(page.getByText(secret)).toHaveCount(0);

    const listed = await trpcQuery<Record<string, unknown>[]>(
      api,
      'client.list',
      { projectId: project.id }
    );
    const listedClient = listed.data?.find((client) => client.id === id);
    expect(listedClient?.type).toBe(type);
    expect(JSON.stringify(listed.data)).not.toContain(secret);
    expect(listedClient).not.toHaveProperty('secret');
    issues.expectNone();
  });
}

test('an event sent with the new write client shows on the events page', async ({
  page,
  seed,
}) => {
  const eventName = `e2e_settings_client_${Date.now()}`;
  const accepted = await sendTrackEvent(api, created.write, eventName, {
    __path: '/pricing',
  });
  expect(accepted.status()).toBe(200);

  const wrongSecret = await sendTrackEvent(
    api,
    { id: created.write.id, secret: 'sec_wrong' },
    eventName
  );
  expect(wrongSecret.status()).toBe(401);

  await expect(async () => {
    await page.goto(`/${seed.organizationId}/${project.id}/events`);
    // The events table shows names with underscores as spaces.
    await expect(
      page.getByText(eventName.replaceAll('_', ' ')).first()
    ).toBeVisible({ timeout: 15_000 });
  }).toPass(INGEST_POLL);
  await screenshot(page, 'clients-event-on-events-page');
});

test('read and root clients answer MCP tools/list, a write client does not', async () => {
  for (const type of ['read', 'root'] as const) {
    const response = await listTools(created[type].mcpToken ?? '');
    expect(response.status(), `${type} client`).toBe(200);
    const body = await response.json();
    expect(body.result.tools.length).toBeGreaterThan(0);
  }

  const writeToken = Buffer.from(
    `${created.write.id}:${created.write.secret}`
  ).toString('base64');
  const rejected = await listTools(writeToken);
  expect(rejected.status()).toBe(401);
});

test('a client can be renamed from the row menu', async ({ page, seed }) => {
  const issues = recordPageIssues(page);
  const renamed = 'E2E settings renamed client';
  await gotoHydrated(
    page,
    `/${seed.organizationId}/${project.id}/settings/clients`,
    createClientButton
  );

  const row = page.getByRole('row', { name: clientName('read') });
  await row.getByRole('button').last().click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  const dialog = page.getByRole('dialog');
  const save = dialog.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();

  await dialog.getByLabel('Name').fill(renamed);
  await save.click();
  await expect(dialog).toBeHidden(SLOW_ASSERT);
  await expect(page.getByRole('row', { name: renamed })).toContainText(
    created.read.id
  );

  await page.reload();
  await expect(page.getByRole('row', { name: renamed })).toBeVisible(
    SLOW_ASSERT
  );
  issues.expectNone();
});

test('a revoked client disappears and is rejected by /track', async ({
  page,
  seed,
}) => {
  const issues = recordPageIssues(page);
  await gotoHydrated(
    page,
    `/${seed.organizationId}/${project.id}/settings/clients`,
    createClientButton
  );

  const row = page.getByRole('row', { name: clientName('write') });
  await row.getByRole('button').last().click();
  await page.getByRole('menuitem', { name: 'Revoke' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Revoke client')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(row).toBeVisible();

  await row.getByRole('button').last().click();
  await page.getByRole('menuitem', { name: 'Revoke' }).click();
  await dialog.getByRole('button', { name: 'Yes' }).click();
  await expect(row).toBeHidden(SLOW_ASSERT);
  await screenshot(page, 'clients-after-revoke');

  await expect
    .poll(
      async () =>
        (
          await sendTrackEvent(api, created.write, 'e2e_settings_revoked')
        ).status(),
      { timeout: 30_000 }
    )
    .toBe(401);
  issues.expectNone();
});

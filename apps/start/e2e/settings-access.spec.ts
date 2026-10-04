import type { APIRequestContext } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  anonymousApi,
  createThrowawayProject,
  LOGGED_OUT,
  SLOW_ASSERT,
  SLOW_TEST_TIMEOUT_MS,
  scheduleProjectDeletion,
  seededApi,
  type ThrowawayProject,
  trpcMutation,
  trpcQuery,
} from './settings-helpers';

const OUTSIDER_PASSWORD = 'Openpanel-e2e-12345!';
const PROJECT_READS = [
  'project.getProjectWithClients',
  'client.list',
  'notification.list',
  'notification.rules',
  'integration.list',
  'import.list',
];

let admin: APIRequestContext;
let outsider: APIRequestContext;
let anonymous: APIRequestContext;
let project: ThrowawayProject;
let organizationId: string;

function writesAgainst(target: ThrowawayProject): [string, unknown][] {
  return [
    ['project.update', { id: target.id, name: 'E2E settings taken over' }],
    ['project.delete', { projectId: target.id }],
    ['project.cancelDeletion', { projectId: target.id }],
    [
      'client.create',
      { name: 'x', projectId: target.id, organizationId, type: 'root' },
    ],
    ['client.update', { id: target.clientId, name: 'taken over' }],
    ['client.remove', { id: target.clientId }],
    [
      'notification.createOrUpdateRule',
      {
        name: 'x',
        projectId: target.id,
        integrations: [],
        sendToApp: false,
        sendToEmail: false,
        config: { type: 'events', events: [] },
      },
    ],
    [
      'integration.createOrUpdate',
      {
        name: 'x',
        projectId: target.id,
        config: { type: 'discord', url: 'https://example.com/hook' },
      },
    ],
    [
      'widget.toggle',
      { projectId: target.id, organizationId, type: 'counter', enabled: true },
    ],
    [
      'import.create',
      {
        projectId: target.id,
        provider: 'umami',
        config: {
          provider: 'umami',
          type: 'file',
          fileUrl: 'https://example.com/export.csv',
          projectMapper: [],
        },
      },
    ],
  ];
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(SLOW_TEST_TIMEOUT_MS);

test.beforeAll(async ({ seed }) => {
  organizationId = seed.organizationId;
  admin = await seededApi();
  anonymous = await anonymousApi();
  outsider = await anonymousApi();
  project = await createThrowawayProject(admin, organizationId, 'access');

  // A real account that is not a member of the seeded organization.
  const signedUp = await trpcMutation(outsider, 'auth.signUpEmail', {
    firstName: 'E2E',
    lastName: 'Outsider',
    email: `e2e-settings-outsider-${Date.now()}@openpanel.local`,
    password: OUTSIDER_PASSWORD,
    confirmPassword: OUTSIDER_PASSWORD,
  });
  expect(signedUp.status, signedUp.errorMessage).toBe(200);
});

test.afterAll(async () => {
  await scheduleProjectDeletion(admin, project.id);
  await Promise.all([admin.dispose(), outsider.dispose(), anonymous.dispose()]);
});

test('project settings are not readable without a session', async () => {
  for (const procedure of PROJECT_READS) {
    const result = await trpcQuery(anonymous, procedure, {
      projectId: project.id,
    });
    expect(result.status, procedure).toBe(401);
    expect(result.data, procedure).toBeUndefined();
  }
});

test('a signed-in user outside the organization can read nothing of the project', async () => {
  for (const procedure of [...PROJECT_READS]) {
    const result = await trpcQuery(outsider, procedure, {
      projectId: project.id,
    });
    expect(result.status, procedure).toBe(403);
    expect(result.data, procedure).toBeUndefined();
  }
  const widget = await trpcQuery(outsider, 'widget.get', {
    projectId: project.id,
    type: 'realtime',
  });
  expect(widget.status).toBe(403);
  const projects = await trpcQuery(outsider, 'project.list', {
    organizationId,
  });
  expect(projects.status).toBe(403);
});

test('a signed-in user outside the organization can change nothing of the project', async () => {
  for (const [procedure, input] of writesAgainst(project)) {
    const result = await trpcMutation(outsider, procedure, input);
    expect(result.status, procedure).toBe(403);
  }

  const untouched = await trpcQuery<{
    name: string;
    deleteAt: string | null;
    clients: { id: string; name: string }[];
  }>(admin, 'project.getProjectWithClients', { projectId: project.id });
  expect(untouched.data).toMatchObject({ name: project.name, deleteAt: null });
  expect(untouched.data?.clients).toHaveLength(1);
  expect(untouched.data?.clients[0]).toMatchObject({ id: project.clientId });
});

test('client secrets are never returned after creation, even to an admin', async () => {
  const clients = await trpcQuery<Record<string, unknown>[]>(
    admin,
    'client.list',
    { projectId: project.id }
  );
  expect(clients.data).toHaveLength(1);
  expect(clients.data?.[0]).not.toHaveProperty('secret');
  expect(JSON.stringify(clients.data)).not.toContain(project.clientSecret);

  const withClients = await trpcQuery(admin, 'project.getProjectWithClients', {
    projectId: project.id,
  });
  expect(JSON.stringify(withClients.data)).not.toContain(project.clientSecret);
  expect(JSON.stringify(withClients.data)).not.toContain('"secret"');
});

test('the settings pages send a logged-out visitor to the login page', async ({
  browser,
}) => {
  const loggedOut = await browser.newContext(LOGGED_OUT);
  const page = await loggedOut.newPage();
  for (const path of ['settings/clients', 'notifications', 'integrations']) {
    await page.goto(`/${organizationId}/${project.id}/${path}`);
    await expect(page).toHaveURL(/\/login/, SLOW_ASSERT);
    await expect(page.getByText(project.clientId)).toHaveCount(0);
  }
  await loggedOut.close();
});

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  API_URL,
  dismissFeedbackPrompt,
  expectNoCrashes,
  gotoHydrated,
  openMenu,
  watchProblems,
} from './org-helpers';

// The shared dev server takes 10-25s per navigation while other suites run.
const SLOW_DEV_SERVER_TIMEOUT_MS = 540_000;
const NAVIGATION_TIMEOUT_MS = 60_000;
const PASSWORD = 'E2e-org-Passw0rd!';

test.setTimeout(SLOW_DEV_SERVER_TIMEOUT_MS);
// A second organization on the seeded admin would turn `/` into a workspace
// picker for every other suite, and an organization cannot be left once
// joined. So this runs as its own user, which nothing else depends on.
test.use({ storageState: { cookies: [], origins: [] } });

interface Organization {
  id: string;
  name: string;
  deleteAt: string | null;
}

const listOrganizations = async (page: Page) => {
  const response = await page.request.get(`${API_URL}/trpc/organization.list`);
  const body = await response.json();
  return body.result.data.json as Organization[];
};

const createWorkspace = async (
  page: Page,
  workspace: string,
  project: string
) => {
  await gotoHydrated(page, '/onboarding/project');
  const createNew = page.getByRole('button', { name: 'Create new workspace' });
  if (await createNew.isVisible()) {
    await createNew.click();
  }
  await page.getByLabel('Workspace name').fill(workspace);
  await page.getByLabel('Your first project name').fill(project);
  await page.getByRole('button', { name: 'Backend / API' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForURL(/\/onboarding\/.+\/connect/, {
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  const organization = (await listOrganizations(page)).find(
    (candidate) => candidate.name === workspace
  );
  if (!organization) {
    throw new Error(`Workspace "${workspace}" was not created`);
  }
  return organization;
};

const scheduleDeletion = async (page: Page, name: string) => {
  await page.getByRole('button', { name: 'Delete Organization' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill(name);
  await dialog.getByRole('button', { name: 'Delete organization' }).click();
  await expect(
    page.getByText('Organization scheduled for deletion').first()
  ).toBeVisible();
};

test('a user with two organizations can switch between them and delete one', async ({
  page,
}) => {
  const problems = watchProblems(page);
  const stamp = Date.now();
  const first = `E2E org A ${stamp}`;
  const second = `E2E org B ${stamp}`;
  await dismissFeedbackPrompt(page);

  await gotoHydrated(page, '/onboarding');
  await page.getByLabel('First name').fill('E2E');
  await page.getByLabel('Last name').fill('OrgOwner');
  await page.getByLabel('Email').fill(`e2e-org-owner-${stamp}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/onboarding\/project/, {
    timeout: NAVIGATION_TIMEOUT_MS,
  });

  const firstOrganization = await createWorkspace(
    page,
    first,
    'E2E org first project'
  );
  // With a single organization `/` goes straight to it.
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`/${firstOrganization.id}$`));

  await gotoHydrated(page, `/${firstOrganization.id}`);
  await openMenu(page, page.getByRole('combobox').first());
  await page.getByRole('menuitem', { name: 'New organization' }).click();
  await expect(page).toHaveURL(/\/onboarding\/project/);
  const secondOrganization = await createWorkspace(
    page,
    second,
    'E2E org second project'
  );

  // With two, `/` is a picker.
  await gotoHydrated(page, '/');
  await expect(
    page.getByRole('link', { name: new RegExp(first) })
  ).toHaveAttribute('href', `/${firstOrganization.id}`);
  await page.getByRole('link', { name: new RegExp(second) }).click();
  await expect(page).toHaveURL(new RegExp(`/${secondOrganization.id}$`));
  await expect(page.locator('.card')).toContainText('E2E org second project');

  const selector = page.getByRole('combobox').first();
  await expect(selector).toHaveText(second);
  await openMenu(page, selector);
  await page.getByRole('menuitem', { name: first, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${firstOrganization.id}$`));
  await expect(selector).toHaveText(first);
  await expect(page.locator('.card')).toContainText('E2E org first project');

  // The seeded organization is not theirs.
  const foreign = await page.goto('/acme');
  expect(foreign?.status()).toBe(404);
  await expect(page.getByText(/not found/i).first()).toBeVisible();
  const foreignApi = await page.request.get(
    `${API_URL}/trpc/project.list?input=${encodeURIComponent(
      JSON.stringify({ json: { organizationId: 'acme' } })
    )}`
  );
  expect(foreignApi.status()).toBe(403);

  // Delete the second organization: confirm modal, schedule, cancel, schedule.
  await gotoHydrated(page, `/${secondOrganization.id}/settings`);
  await page.getByRole('button', { name: 'Delete Organization' }).click();
  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: 'Delete organization' });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('textbox').fill('something else');
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(
    (await listOrganizations(page)).find(
      (org) => org.id === secondOrganization.id
    )?.deleteAt
  ).toBeNull();

  await scheduleDeletion(page, second);
  await expect(
    page.getByText('This organization will be deleted on')
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Delete Organization' })
  ).toBeDisabled();
  await page.screenshot({
    path: 'test-results/org/shots/organization-scheduled-for-deletion.png',
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Cancel deletion' }).click();
  await expect(page.getByText('Organization deletion cancelled')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Delete Organization' })
  ).toBeEnabled();

  await scheduleDeletion(page, second);
  await gotoHydrated(page, `/${firstOrganization.id}/settings`);
  await scheduleDeletion(page, first);
  const remaining = await listOrganizations(page);
  expect(remaining.every((org) => org.deleteAt !== null)).toBe(true);
  expectNoCrashes(problems);
});

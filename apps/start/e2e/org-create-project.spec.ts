import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  apiFailures,
  deleteProjectThroughSettings,
  dismissFeedbackPrompt,
  expectNoCrashes,
  gotoHydrated,
  openMenu,
  shot,
  trpcQuery,
  watchProblems,
} from './org-helpers';

// The shared dev server takes 10-25s per navigation while other suites run.
const SLOW_DEV_SERVER_TIMEOUT_MS = 240_000;
const HYDRATION_TIMEOUT_MS = 40_000;

test.setTimeout(SLOW_DEV_SERVER_TIMEOUT_MS);

interface CreatedProject {
  id: string;
  name: string;
  domain: string | null;
  cors: string[];
  types: string[];
  deleteAt: string | null;
}

const findProject = async (
  page: Page,
  organizationId: string,
  name: string
) => {
  const projects = await trpcQuery<CreatedProject[]>(page, 'project.list', {
    organizationId,
  });
  const project = projects.find((candidate) => candidate.name === name);
  if (!project) {
    throw new Error(`Project "${name}" was not created`);
  }
  return project;
};

const openFromActionMenu = async (page: Page): Promise<Locator> => {
  await openMenu(
    page,
    page.getByRole('button', { name: /Create a project|Invite a user/ })
  );
  await page.getByRole('menuitem', { name: 'Create a project' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'Create project' })
  ).toBeVisible();
  return dialog;
};

const submit = (dialog: Locator) =>
  dialog.getByRole('button', { name: 'Create project' }).click();

test.beforeEach(async ({ page, seed }) => {
  await dismissFeedbackPrompt(page);
  await gotoHydrated(page, `/${seed.organizationId}`);
});

test('the form validates name, type and domain before creating anything', async ({
  page,
  seed,
}) => {
  const before = await trpcQuery<CreatedProject[]>(page, 'project.list', {
    organizationId: seed.organizationId,
  });
  const dialog = await openFromActionMenu(page);
  const typeError = dialog.getByText('At least one type must be selected');

  await submit(dialog);
  await expect(typeError).toHaveCount(3);
  await expect(dialog.getByText('Issues')).toHaveCount(1);

  await dialog.getByLabel('Project name').fill('ab');
  await dialog.getByText('Website', { exact: true }).click();
  await expect(typeError).toHaveCount(0);
  await expect(dialog.getByRole('switch', { name: /^App/ })).toBeDisabled();
  await submit(dialog);
  // Name too short and domain missing.
  await expect(dialog.getByText('Issues')).toHaveCount(2);

  await dialog.getByLabel('Project name').fill('E2E org never created');
  await dialog.getByLabel('Domain').fill('not a url');
  await submit(dialog);
  await expect(dialog.getByText('Issues')).toHaveCount(1);
  await shot(page, 'create-project-validation');

  await dialog.getByText('Website', { exact: true }).click();
  await expect(dialog.getByLabel('Domain')).toBeHidden();
  await expect(dialog.getByRole('switch', { name: /^App/ })).toBeEnabled();
  await dialog.getByText('App', { exact: true }).click();
  await expect(dialog.getByRole('switch', { name: /^Website/ })).toBeDisabled();

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  const after = await trpcQuery<CreatedProject[]>(page, 'project.list', {
    organizationId: seed.organizationId,
  });
  expect(after.length).toBe(before.length);
});

test('a website + backend project is created with its domains and leads into setup', async ({
  page,
  seed,
}) => {
  const problems = watchProblems(page);
  const name = `E2E org web ${Date.now()}`;
  const dialog = await openFromActionMenu(page);

  await dialog.getByLabel('Project name').fill(name);
  await dialog.getByText('Website', { exact: true }).click();
  const domain = dialog.getByLabel('Domain');
  await domain.fill('https://e2e-org.example.com');
  await domain.blur();
  // Leaving the domain field seeds the allowed domains with it.
  await expect(
    dialog.locator('[data-tag="https://e2e-org.example.com"]')
  ).toBeVisible();

  const tagInput = dialog.getByPlaceholder(/Accept events from these domains/);
  await tagInput.fill('second.example.com');
  await tagInput.press('Enter');
  await expect(
    dialog.locator('[data-tag="https://second.example.com"]')
  ).toBeVisible();
  // A duplicate is not added twice.
  await tagInput.fill('https://second.example.com');
  await tagInput.press('Enter');
  await expect(
    dialog.locator('[data-tag="https://second.example.com"]')
  ).toHaveCount(1);
  await tagInput.fill('');
  await tagInput.fill('removed.example.com');
  await tagInput.press('Enter');
  await dialog
    .locator('[data-tag="https://removed.example.com"]')
    .getByRole('button', { name: 'Remove tag' })
    .click();
  await expect(
    dialog.locator('[data-tag="https://removed.example.com"]')
  ).toHaveCount(0);

  await dialog.getByText('Backend / API', { exact: true }).click();
  // Keyboard submit from the name field.
  await dialog.getByLabel('Project name').press('Enter');

  await expect(dialog.getByText('Your project is created')).toBeVisible();
  await expect(page.getByText('Project created')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Client ID/ })).toContainText(
    /[0-9a-f-]{36}/
  );
  await expect(dialog.getByRole('button', { name: /Secret/ })).toContainText(
    /sec_[0-9a-f]{20}/
  );
  await shot(page, 'create-project-success');

  const project = await findProject(page, seed.organizationId, name);
  expect(project.domain).toBe('https://e2e-org.example.com');
  expect(project.cors).toEqual([
    'https://e2e-org.example.com',
    'https://second.example.com',
  ]);

  await dialog.getByRole('link', { name: 'Set up tracking' }).click();
  await expect(page).toHaveURL(new RegExp(`/onboarding/${project.id}/connect`));
  // The secret is read from sessionStorage after hydration.
  await expect(page.getByText(/sec_[0-9a-f]{20}/).first()).toBeVisible({
    timeout: HYDRATION_TIMEOUT_MS,
  });
  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page).toHaveURL(new RegExp(`/onboarding/${project.id}/verify`));
  await expect(page.getByText('Waiting for events')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Skip for now' })
  ).toHaveAttribute('href', `/${seed.organizationId}/${project.id}`);

  await deleteProjectThroughSettings(page, seed.organizationId, project.id);
  const deleted = await findProject(page, seed.organizationId, name);
  expect(deleted.deleteAt).not.toBeNull();
  expectNoCrashes(problems);
  expect(apiFailures(problems)).toEqual([]);
});

// BUG org-3: project.create hardcodes `types: []`, so the choice made in this
// modal is dropped (onboarding's first project keeps it).
test('the tracking types chosen in the modal are stored on the project', async ({
  page,
  seed,
}) => {
  const name = `E2E org app ${Date.now()}`;
  const dialog = page.getByRole('dialog');
  // Second entry point: the project selector.
  await openMenu(page, page.getByRole('combobox').first());
  await page.getByRole('menuitem', { name: 'Create new project' }).click();

  await dialog.getByLabel('Project name').fill(name);
  await dialog.getByText('App', { exact: true }).click();
  await dialog.getByText('Backend / API', { exact: true }).click();
  await submit(dialog);
  await expect(dialog.getByText('Your project is created')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).last().click();
  await expect(dialog).toBeHidden();
  // Projects without events sort after the seeded ones, where cards are lazy.
  await page.getByRole('textbox', { name: 'Search projects' }).click();
  await page.getByRole('textbox', { name: 'Search projects' }).fill(name);
  await expect(page.locator('.card', { hasText: name })).toBeVisible();

  const project = await findProject(page, seed.organizationId, name);
  await deleteProjectThroughSettings(page, seed.organizationId, project.id);
  expect(project.domain).toBeNull();
  expect([...project.types].sort()).toEqual(['app', 'backend']);
});

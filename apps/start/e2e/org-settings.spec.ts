import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  dismissFeedbackPrompt,
  expectNoCrashes,
  gotoHydrated,
  shot,
  trpcQuery,
  watchProblems,
} from './org-helpers';

// The shared dev server takes 10-25s per navigation while other suites run.
const SLOW_DEV_SERVER_TIMEOUT_MS = 180_000;
const SEEDED_NAME = 'Acme';
const SEEDED_TIMEZONE = 'UTC';
// Same offset as UTC all year, so other suites' numbers do not move while this runs.
const OTHER_TIMEZONE = 'Africa/Abidjan';

test.setTimeout(SLOW_DEV_SERVER_TIMEOUT_MS);

interface Organization {
  name: string;
  timezone: string;
}

const getOrganization = (page: Page, organizationId: string) =>
  trpcQuery<Organization>(page, 'organization.get', { organizationId });

const timezonePicker = (page: Page) =>
  page.locator('form').getByRole('combobox');
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save' });

const pickTimezone = async (page: Page, zone: string) => {
  await timezonePicker(page).click();
  await page.getByRole('option', { name: zone, exact: true }).click();
  await expect(timezonePicker(page)).toHaveText(zone);
};

test.beforeEach(async ({ page, seed }) => {
  await dismissFeedbackPrompt(page);
  await gotoHydrated(page, `/${seed.organizationId}/settings`);
});

test.afterEach(async ({ page, seed }) => {
  const organization = await getOrganization(page, seed.organizationId);
  expect(organization.name).toBe(SEEDED_NAME);
  expect(organization.timezone).toBe(SEEDED_TIMEZONE);
});

test('the name can be changed and restored', async ({ page, seed }) => {
  const problems = watchProblems(page);
  const name = page.getByLabel('Name');
  const renamed = `Acme E2E org ${Date.now()}`;
  await expect(name).toHaveValue(SEEDED_NAME);
  await expect(saveButton(page)).toBeDisabled();

  await name.fill(renamed);
  await expect(saveButton(page)).toBeEnabled();
  // Keyboard submit.
  await name.press('Enter');
  await expect(page.getByText('Organization updated')).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();
  try {
    expect((await getOrganization(page, seed.organizationId)).name).toBe(
      renamed
    );
    await page.reload();
    await expect(page.getByLabel('Name')).toHaveValue(renamed);
    // The selector is empty until organization.list loads on the client.
    await expect(page.getByRole('combobox').first()).toHaveText(renamed, {
      timeout: 30_000,
    });
  } finally {
    await gotoHydrated(page, `/${seed.organizationId}/settings`);
    await page.getByLabel('Name').fill(SEEDED_NAME);
    await saveButton(page).click();
    await expect(page.getByLabel('Name')).toHaveValue(SEEDED_NAME);
    await expect(saveButton(page)).toBeDisabled();
  }
  expectNoCrashes(problems);
});

// Open defect: saving refetches organization.get only; the sidebar reads organization.list.
test('the sidebar shows the new name right after a rename', async ({
  page,
}) => {
  const renamed = `Acme E2E org ${Date.now()}`;
  await page.getByLabel('Name').fill(renamed);
  await saveButton(page).click();
  await expect(page.getByText('Organization updated')).toBeVisible();
  try {
    await expect.soft(page.getByRole('combobox').first()).toHaveText(renamed);
  } finally {
    await page.getByLabel('Name').fill(SEEDED_NAME);
    await saveButton(page).click();
    await expect(saveButton(page)).toBeDisabled();
  }
});

// Open defect: the form has no resolver, so the server's zod issue list is shown raw.
test('a too short name gets a readable validation message', async ({
  page,
  seed,
}) => {
  await page.getByLabel('Name').fill('A');
  await saveButton(page).click();
  const toast = page.locator('[data-sonner-toast]').first();
  const inlineError = page.getByText('Issues');
  await expect(toast.or(inlineError).first()).toBeVisible();
  await shot(page, 'settings-short-name');
  expect((await getOrganization(page, seed.organizationId)).name).toBe(
    SEEDED_NAME
  );
  if (await toast.isVisible()) {
    await expect(toast).not.toContainText('"code"');
  }
});

test('the timezone can be changed, survives a reload and is restored', async ({
  page,
  seed,
}) => {
  await expect(timezonePicker(page)).toHaveText(SEEDED_TIMEZONE);
  await pickTimezone(page, OTHER_TIMEZONE);
  await saveButton(page).click();
  await expect(page.getByText('Organization updated')).toBeVisible();
  try {
    expect((await getOrganization(page, seed.organizationId)).timezone).toBe(
      OTHER_TIMEZONE
    );
    await page.reload();
    await expect(timezonePicker(page)).toHaveText(OTHER_TIMEZONE);
  } finally {
    await gotoHydrated(page, `/${seed.organizationId}/settings`);
    await pickTimezone(page, SEEDED_TIMEZONE);
    await saveButton(page).click();
    await expect(saveButton(page)).toBeDisabled();
  }
});

// Open defect: 419 zones in a list that cannot be searched.
test('the timezone picker can be searched', async ({ page }) => {
  await timezonePicker(page).click();
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.keyboard.type('stockholm');
  await expect(
    page.getByRole('option', { name: 'Europe/Stockholm' })
  ).toBeVisible();
});

test('deleting is blocked while the seeded subscription is active', async ({
  page,
}) => {
  await expect(page.getByText('Cancel your subscription first')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Delete Organization' })
  ).toBeDisabled();
});

test('the settings page fits a phone', async ({ page, seed }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHydrated(page, `/${seed.organizationId}/settings`);
  await expect(page.getByLabel('Name')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

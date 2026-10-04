import { expect, test } from './fixtures';

test('a project can be created from the organization page', async ({
  page,
  seed,
}) => {
  const projectName = `E2E project ${Date.now()}`;
  await page.goto(`/${seed.organizationId}`);
  await page.waitForLoadState('networkidle');
  // The sidebar action button cycles its label; the menu behind it is stable.
  await page.getByRole('button', { name: /Create a project/ }).click();
  await page.getByRole('menuitem', { name: 'Create a project' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Project name').fill(projectName);
  await dialog.getByText('Backend / API', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Create project' }).click();

  await expect(dialog.getByText('Your project is created')).toBeVisible();
  await dialog
    .getByRole('button', { name: 'Close', exact: true })
    .first()
    .click();
  await expect(page.getByText(projectName, { exact: true })).toBeVisible();
});

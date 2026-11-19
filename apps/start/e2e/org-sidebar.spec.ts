import { expect, test } from './fixtures';
import {
  dismissFeedbackPrompt,
  expectNoCrashes,
  gotoHydrated,
  openMenu,
  trpcQuery,
  watchProblems,
} from './org-helpers';

const SELECTOR_PROJECT_LIMIT = 10;
// The shared dev server takes 10-25s per navigation while other suites run.
const SLOW_DEV_SERVER_TIMEOUT_MS = 150_000;

test.setTimeout(SLOW_DEV_SERVER_TIMEOUT_MS);

test.beforeEach(async ({ page, seed }) => {
  await dismissFeedbackPrompt(page);
  await gotoHydrated(page, `/${seed.organizationId}`);
});

test('the action button rotates and opens both actions', async ({ page }) => {
  const trigger = page.getByRole('button', {
    name: /Create a project|Invite a user/,
  });
  await expect(trigger).toContainText('Create a project');
  await expect(trigger).toContainText('Invite a user', { timeout: 6000 });

  await openMenu(page, trigger);
  await page.getByRole('menuitem', { name: 'Create a project' }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Create project' })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  await openMenu(page, trigger);
  await page.getByRole('menuitem', { name: 'Invite a user' }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Invite a user' })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('the selector lists projects and organizations and switches project', async ({
  page,
  seed,
}) => {
  const problems = watchProblems(page);
  const projects = await trpcQuery<{ id: string; name: string }[]>(
    page,
    'project.list',
    { organizationId: seed.organizationId }
  );
  const selector = page.getByRole('combobox').first();
  await expect(selector).toHaveText('Acme');
  const menu = await openMenu(page, selector);

  for (const project of projects.slice(0, SELECTOR_PROJECT_LIMIT)) {
    await expect(
      menu.getByRole('menuitem', { name: project.name, exact: true })
    ).toBeVisible();
  }
  const allProjects = menu.getByRole('menuitem', { name: 'All projects' });
  await expect(allProjects).toHaveCount(
    projects.length > SELECTOR_PROJECT_LIMIT ? 1 : 0
  );
  await expect(
    menu.getByRole('menuitem', { name: 'Acme', exact: true })
  ).toBeVisible();
  await expect(
    menu.getByRole('menuitem', { name: 'New organization' })
  ).toHaveAttribute('href', '/onboarding/project');

  await menu.getByRole('menuitem', { name: 'Acme Web', exact: true }).click();
  await expect(page).toHaveURL(/\/acme\/acme-web$/);
  await expect(selector).toHaveText('Acme Web');

  await openMenu(page, selector);
  await page.getByRole('menuitem', { name: 'Acme SaaS', exact: true }).click();
  await expect(page).toHaveURL(/\/acme\/acme-saas$/);
  expectNoCrashes(problems);
});

test('"Create new project" in the selector opens the modal', async ({
  page,
}) => {
  await openMenu(page, page.getByRole('combobox').first());
  await page.getByRole('menuitem', { name: 'Create new project' }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Create project' })
  ).toBeVisible();
});

test('navigation links reach every organization page', async ({ page }) => {
  const problems = watchProblems(page);
  const pages = [
    {
      link: 'Settings',
      url: /\/acme\/settings$/,
      heading: 'Workspace settings',
    },
    { link: 'Billing', url: /\/acme\/billing$/, heading: 'Billing' },
    { link: 'Members', url: /\/acme\/members\/members$/, heading: 'Members' },
    { link: 'Projects', url: /\/acme$/, heading: 'Projects' },
  ];
  for (const target of pages) {
    const link = page.getByRole('link', { name: target.link, exact: true });
    await link.click();
    await expect(page).toHaveURL(target.url);
    await expect(
      page.getByRole('heading', { name: target.heading, level: 1 })
    ).toBeVisible();
    await expect(link).toHaveAttribute('data-status', 'active');
  }
  await page.goBack();
  await expect(page).toHaveURL(/\/acme\/members\/members$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/acme$/);
  expectNoCrashes(problems);
});

test('footer has docs, feedback and the profile menu', async ({ page }) => {
  const docs = page.getByRole('link', { name: 'Docs' });
  await expect(docs).toHaveAttribute('href', 'https://openpanel.dev/docs');
  await expect(docs).toHaveAttribute('target', '_blank');
  await expect(
    page.getByRole('button', { name: 'Give feedback' })
  ).toBeEnabled();

  const menu = await openMenu(
    page,
    page.getByRole('button', { name: 'Profile' })
  );
  await expect(menu.getByRole('menuitem', { name: 'Logout' })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Account' }).click();
  await expect(page).toHaveURL(/\/acme\/account/);
});

test('the theme switch applies, persists and restores', async ({ page }) => {
  const html = page.locator('html');
  const pickTheme = async (name: string) => {
    await openMenu(page, page.getByRole('button', { name: 'Profile' }));
    await page.getByRole('menuitem', { name: /Theme/ }).click();
    await page.getByRole('menuitem', { name }).click();
  };

  await pickTheme('Dark');
  await expect(html).toHaveClass(/dark/);
  await page.reload();
  await expect(html).toHaveClass(/dark/);

  await gotoHydrated(page, page.url());
  await pickTheme('Light');
  await expect(html).toHaveClass(/light/);
  await expect(html).not.toHaveClass(/dark/);

  await pickTheme('System');
  await expect(html).toHaveClass(/system/);
});

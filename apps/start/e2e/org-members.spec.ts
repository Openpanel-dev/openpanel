import type { Browser, Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  API_URL,
  dismissFeedbackPrompt,
  expectNoCrashes,
  gotoHydrated,
  openMenu,
  shot,
  trpcMutation,
  trpcQuery,
  watchProblems,
} from './org-helpers';

// The shared dev server takes 10-25s per navigation while other suites run.
const SLOW_DEV_SERVER_TIMEOUT_MS = 420_000;
const GUEST_PASSWORD = 'E2e-org-Passw0rd!';
const HTTP_FORBIDDEN = 403;
const HTTP_OK = 200;
const ACTION_TIMEOUT_MS = 30_000;
const ROW_ACTION_TIMEOUT_MS = 3000;

test.setTimeout(SLOW_DEV_SERVER_TIMEOUT_MS);
test.use({ actionTimeout: ACTION_TIMEOUT_MS });

interface Invite {
  id: string;
  email: string;
  role: string;
  projectAccess: { projectId: string; level: string }[];
}

interface Member {
  id: string;
  userId: string;
  email: string;
  role: string;
  access: { projectId: string; level: string }[];
}

const THROWAWAY_EMAIL = /^e2e-org-\d+@example\.com$/;

const uniqueEmail = () => `e2e-org-${Date.now()}@example.com`;

const listInvites = (page: Page, organizationId: string) =>
  trpcQuery<Invite[]>(page, 'organization.invitations', { organizationId });

const listMembers = (page: Page, organizationId: string) =>
  trpcQuery<Member[]>(page, 'organization.members', { organizationId });

const openInviteSheet = async (page: Page): Promise<Locator> => {
  await page.getByRole('button', { name: 'Invite user' }).click();
  const sheet = page.getByRole('dialog');
  await expect(
    sheet.getByRole('heading', { name: 'Invite a user' })
  ).toBeVisible();
  return sheet;
};

const sendInvite = (sheet: Locator) =>
  sheet.getByRole('button', { name: 'Invite user' }).click();

const pickProjects = async (page: Page, scope: Locator, names: string[]) => {
  await scope
    .getByRole('button', { name: /Restrict access to projects/ })
    .click();
  for (const name of names) {
    await page.getByRole('option', { name }).click();
  }
  await page.keyboard.press('Escape');
};

// The row menu unmounts when the table re-renders after a refetch, so a click
// can land on a menu that is already gone; open it again until the click sticks.
const clickRowAction = async (page: Page, email: string, action: string) => {
  const trigger = page
    .getByRole('row', { name: new RegExp(email) })
    .getByRole('button');
  await expect(async () => {
    const menu = await openMenu(page, trigger);
    await menu
      .getByRole('menuitem', { name: action })
      .click({ timeout: ROW_ACTION_TIMEOUT_MS });
  }).toPass({ timeout: ACTION_TIMEOUT_MS * 2 });
};

// The row can vanish while the table re-renders, before the server has
// finished, so wait for the mutation itself (not its CORS preflight).
const removeMember = async (page: Page, email: string) => {
  const removed = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('organization.removeMember') &&
      response.ok()
  );
  await clickRowAction(page, email, 'Remove member');
  await removed;
};

const guestStatus = async (guest: Page, path: string, input: unknown) => {
  const query = encodeURIComponent(JSON.stringify({ json: input }));
  const response = await guest.request.get(
    `${API_URL}/trpc/${path}?input=${query}`
  );
  return response.status();
};

const signUpThroughInvite = async (
  browser: Browser,
  inviteId: string,
  email: string
) => {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    storageState: { cookies: [], origins: [] },
  });
  const guest = await context.newPage();
  await dismissFeedbackPrompt(guest);
  await gotoHydrated(guest, `/onboarding?inviteId=${inviteId}`);
  await expect(guest.getByText('Invitation to Acme')).toBeVisible();
  await guest.getByLabel('First name').fill('E2E');
  await guest.getByLabel('Last name').fill('OrgMember');
  await guest.getByLabel('Email').fill(email);
  await guest.getByLabel('Password', { exact: true }).fill(GUEST_PASSWORD);
  await guest.getByLabel('Confirm password').fill(GUEST_PASSWORD);
  await guest.getByRole('button', { name: 'Create account' }).click();
  await guest.waitForURL(/\/acme$/, { timeout: 60_000 });
  return { context, guest };
};

test.beforeEach(async ({ page }) => {
  await dismissFeedbackPrompt(page);
});

// A test that fails halfway must not leave invites or members on the seeded organization.
test.afterEach(async ({ page, seed }) => {
  const { organizationId } = seed;
  for (const invite of await listInvites(page, organizationId)) {
    if (THROWAWAY_EMAIL.test(invite.email)) {
      await trpcMutation(page, 'organization.revokeInvite', {
        inviteId: invite.id,
      });
    }
  }
  for (const member of await listMembers(page, organizationId)) {
    if (THROWAWAY_EMAIL.test(member.email)) {
      await trpcMutation(page, 'organization.removeMember', {
        organizationId,
        userId: member.userId,
        id: member.id,
      });
    }
  }
});

test('the members tab lists the admin and filters by email', async ({
  page,
  seed,
}) => {
  const problems = watchProblems(page);
  await gotoHydrated(page, `/${seed.organizationId}/members`);
  await expect(page).toHaveURL(/\/members\/members$/);
  const adminRow = page.getByRole('row', { name: new RegExp(seed.user.email) });
  await expect(adminRow).toContainText('Seed Admin');
  await expect(adminRow).toContainText('org:admin');
  await expect(adminRow).toContainText('All projects');

  const search = page.getByRole('textbox', { name: 'Search email' });
  await search.click();
  await search.fill('nobody-matches-this');
  await expect(adminRow).toHaveCount(0);
  await expect(page.getByText('No data')).toBeVisible();
  await search.fill('admin@');
  await expect(adminRow).toBeVisible();

  await page.getByRole('tab', { name: 'Invitations' }).click();
  await expect(page).toHaveURL(/\/members\/invitations$/);
  await expect(page.getByRole('button', { name: 'Invite user' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/members\/members/);
  await shot(page, 'members');
  expectNoCrashes(problems);
});

test('invite validation: bad email, existing member, duplicate', async ({
  page,
  seed,
}) => {
  const email = uniqueEmail();
  await gotoHydrated(page, `/${seed.organizationId}/members/invitations`);
  const sheet = await openInviteSheet(page);

  await sendInvite(sheet);
  await expect(sheet.getByText('Issues')).toBeVisible();
  await sheet.getByLabel('Email').fill('not-an-email');
  await sendInvite(sheet);
  await expect(sheet.getByText('Issues')).toBeVisible();

  await sheet.getByLabel('Email').fill(seed.user.email.toUpperCase());
  await sendInvite(sheet);
  await expect(
    page.getByText('User is already a member of the organization')
  ).toBeVisible();

  await sheet.getByLabel('Email').fill(email);
  await sendInvite(sheet);
  await expect(
    sheet.getByRole('heading', { name: 'User has been invited' })
  ).toBeVisible();
  await expect(sheet.getByText('We have sent an email')).toBeVisible();

  await sheet.getByRole('button', { name: 'Invite another user' }).click();
  await sheet.getByLabel('Email').fill(email.toUpperCase());
  await sendInvite(sheet);
  await expect(
    page.getByText('User is already invited to the organization')
  ).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).first().click();

  await clickRowAction(page, email, 'Revoke invite');
  await expect(page.getByText(`Invite for ${email} revoked`)).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(email) })).toHaveCount(
    0
  );
  const invites = await listInvites(page, seed.organizationId);
  expect(invites.find((invite) => invite.email === email)).toBeUndefined();
});

test('an admin invite with project access shows in the list and can be copied and revoked', async ({
  page,
  seed,
  context,
}) => {
  const email = uniqueEmail();
  await gotoHydrated(page, `/${seed.organizationId}/members/invitations`);
  const sheet = await openInviteSheet(page);
  await sheet.getByLabel('Email').fill(email);
  await sheet.getByRole('radio', { name: 'Admin' }).click();
  await pickProjects(page, sheet, ['Acme Web', 'Acme Shop']);
  await sheet.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Read-only' }).click();
  await shot(page, 'invite-sheet');
  await sendInvite(sheet);
  await expect(
    sheet.getByRole('heading', { name: 'User has been invited' })
  ).toBeVisible();
  await sheet.getByRole('button', { name: 'Close' }).first().click();

  const row = page.getByRole('row', { name: new RegExp(email) });
  await expect(row).toContainText('org:admin');
  await expect(row).toContainText('Acme Web (read-only)');
  await expect(row).toContainText('Acme Shop');
  await shot(page, 'invitations');

  const invites = await listInvites(page, seed.organizationId);
  const invite = invites.find((candidate) => candidate.email === email);
  expect(invite?.role).toBe('org:admin');
  expect(invite?.projectAccess).toEqual([
    { projectId: 'acme-web', level: 'read' },
    { projectId: 'acme-shop', level: 'write' },
  ]);

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await clickRowAction(page, email, 'Copy invite link');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(new RegExp(`/onboarding\\?inviteId=${invite?.id}$`));

  await clickRowAction(page, email, 'Revoke invite');
  await expect(row).toHaveCount(0);

  // A revoked link no longer offers the organization.
  const guestContext = await page
    .context()
    .browser()
    ?.newContext({
      ignoreHTTPSErrors: true,
      storageState: { cookies: [], origins: [] },
    });
  if (!guestContext) {
    throw new Error('No browser');
  }
  const guest = await guestContext.newPage();
  await guest.goto(`/onboarding?inviteId=${invite?.id}`);
  await expect(
    guest.getByRole('button', { name: 'Create account' })
  ).toBeVisible();
  await expect(guest.getByText('Invitation to Acme')).toHaveCount(0);
  await guestContext.close();
});

// Open defect: the picker offers "Pick '<typed text>'" for anything that is not a project.
test('the project access picker only offers projects', async ({
  page,
  seed,
}) => {
  await gotoHydrated(page, `/${seed.organizationId}/members/invitations`);
  const sheet = await openInviteSheet(page);
  await sheet
    .getByRole('button', { name: /Restrict access to projects/ })
    .click();
  await expect(page.getByRole('option', { name: 'Acme Web' })).toBeVisible();
  await page.keyboard.type('no-such-project');
  await expect(page.getByRole('option', { name: /Pick/ })).toHaveCount(0);
});

test.describe('an invited member', () => {
  test('joins with restricted access, sees a restricted UI, and follows access edits', async ({
    page,
    seed,
    browser,
  }) => {
    const email = uniqueEmail();
    await gotoHydrated(page, `/${seed.organizationId}/members/invitations`);
    const sheet = await openInviteSheet(page);
    await sheet.getByLabel('Email').fill(email);
    await pickProjects(page, sheet, ['Acme Web', 'Acme Shop']);
    await sheet.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Read-only' }).click();
    await sendInvite(sheet);
    await expect(
      sheet.getByRole('heading', { name: 'User has been invited' })
    ).toBeVisible();
    const invite = (await listInvites(page, seed.organizationId)).find(
      (candidate) => candidate.email === email
    );
    if (!invite) {
      throw new Error('Invite was not created');
    }

    const { context, guest } = await signUpThroughInvite(
      browser,
      invite.id,
      email
    );
    try {
      // Accepting consumes the invite and creates the membership with the grants.
      expect(
        (await listInvites(page, seed.organizationId)).some(
          (candidate) => candidate.email === email
        )
      ).toBe(false);
      const member = (await listMembers(page, seed.organizationId)).find(
        (candidate) => candidate.email === email
      );
      expect(member?.role).toBe('org:member');
      expect(
        member?.access.map((grant) => [grant.projectId, grant.level])
      ).toEqual([
        ['acme-web', 'read'],
        ['acme-shop', 'write'],
      ]);

      // Restricted UI for a non-admin.
      await expect(guest.locator('.card')).toHaveCount(2);
      await expect(
        guest.getByRole('link', { name: 'Members', exact: true })
      ).toHaveCount(0);
      await expect(
        guest.getByRole('link', { name: 'Billing', exact: true })
      ).toHaveCount(0);
      await expect(
        guest.getByRole('button', { name: /Create a project|Invite a user/ })
      ).toHaveCount(0);
      await guest.screenshot({
        path: 'test-results/org/shots/member-projects.png',
      });
      for (const adminOnly of ['members', 'billing']) {
        await guest.goto(`/${seed.organizationId}/${adminOnly}`);
        await expect(guest).toHaveURL(new RegExp(`/${seed.organizationId}$`));
      }
      await guest.goto(`/${seed.organizationId}/acme-saas`);
      await expect(
        guest.getByText('You do not have access to this project')
      ).toBeVisible();
      expect(
        await guestStatus(guest, 'organization.members', {
          organizationId: seed.organizationId,
        })
      ).toBe(HTTP_FORBIDDEN);

      // The admin edits the member's access.
      await gotoHydrated(page, `/${seed.organizationId}/members`);
      const row = page.getByRole('row', { name: new RegExp(email) });
      await expect(row).toContainText('E2E OrgMember');
      await clickRowAction(page, email, 'Edit access');
      const dialog = page.getByRole('dialog');
      await expect(
        dialog.getByRole('heading', { name: 'Edit access for E2E OrgMember' })
      ).toBeVisible();
      await expect(dialog.getByRole('combobox').first()).toHaveText(
        'Read-only'
      );
      await dialog
        .getByRole('button', { name: /Acme Web/ })
        .first()
        .click();
      await page.getByRole('option', { name: 'Acme Shop' }).click();
      await page.getByRole('option', { name: 'Acme App' }).click();
      await page.keyboard.press('Escape');
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Access updated')).toBeVisible();
      await expect(row).toContainText('acme-app');
      await expect(row).not.toContainText('acme-shop');

      await gotoHydrated(guest, `/${seed.organizationId}`);
      await expect(guest.locator('.card')).toHaveCount(2);
      await expect(
        guest.locator('.card', { hasText: 'Acme App' })
      ).toBeVisible();
      await expect(
        guest.locator('.card', { hasText: 'Acme Shop' })
      ).toHaveCount(0);

      // Cancel leaves access untouched.
      await clickRowAction(page, email, 'Edit access');
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
    } finally {
      await gotoHydrated(page, `/${seed.organizationId}/members`);
      await removeMember(page, email);
      await expect(
        page.getByText('E2E has been removed from the organization')
      ).toBeVisible();
      await expect(
        page.getByRole('row', { name: new RegExp(email) })
      ).toHaveCount(0);
      await context.close();
    }
  });

  // Open defect: removeMember and updateMemberAccess do not clear the 5-minute
  // access cache, so the removed user keeps reading project data.
  test('loses access as soon as an admin removes them', async ({
    page,
    seed,
    browser,
  }) => {
    const email = uniqueEmail();
    await gotoHydrated(page, `/${seed.organizationId}/members/invitations`);
    const sheet = await openInviteSheet(page);
    await sheet.getByLabel('Email').fill(email);
    await sendInvite(sheet);
    await expect(
      sheet.getByRole('heading', { name: 'User has been invited' })
    ).toBeVisible();
    const invite = (await listInvites(page, seed.organizationId)).find(
      (candidate) => candidate.email === email
    );
    if (!invite) {
      throw new Error('Invite was not created');
    }
    const { context, guest } = await signUpThroughInvite(
      browser,
      invite.id,
      email
    );
    const readProject = () =>
      guestStatus(guest, 'chart.projectCard', { projectId: 'acme-web' });
    try {
      expect(await readProject()).toBe(HTTP_OK);
    } finally {
      await gotoHydrated(page, `/${seed.organizationId}/members`);
      await removeMember(page, email);
      await expect(
        page.getByRole('row', { name: new RegExp(email) })
      ).toHaveCount(0);
    }
    expect.soft(await readProject()).toBe(HTTP_FORBIDDEN);
    await guest.goto(`/${seed.organizationId}`);
    await expect
      .soft(guest.getByRole('link', { name: 'Settings', exact: true }))
      .toHaveCount(0);
    await context.close();
  });
});

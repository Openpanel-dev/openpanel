// One brand-new user from sign-up to account deletion: onboarding (project,
// connect, verify), the account pages, two-factor and password reset.
//
// The tests run in order and hand each other the user through a state file
// rather than module variables: a failed test restarts the worker, and the
// tests that document a known bug are expected to fail without taking the rest
// of the journey down with them.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import {
  apiUrl,
  FRESH_CONTEXT,
  gotoHydrated,
  hasHorizontalOverflow,
  SHOTS_DIR,
  submitSignIn,
  toast,
  totpCode,
  trackEvent,
  waitForHydration,
  watchIssues,
  wrongTotpCode,
} from './auth-helpers';
import { expect, test } from './fixtures';

test.use({ storageState: FRESH_CONTEXT });
// The dev server hydrates slowly when several suites share it.
test.describe.configure({ timeout: 120_000 });

const STATE_FILE = 'test-results/auth/onboarding-state.json';
const RUN_ID = Date.now();
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_PATTERN = /[A-Z2-9]{5}-[A-Z2-9]{5}/g;
const TOTP_SECRET_PATTERN = /[A-Z2-7]{32}/;
const FRAMEWORK_COUNT = 15;
const EVENT_ARRIVAL_TIMEOUT_MS = 45_000;

interface ProjectState {
  id: string;
  clientId: string;
  clientSecret: string;
}

interface JourneyState {
  email: string;
  password: string;
  cookies: Awaited<ReturnType<BrowserContext['cookies']>>;
  organizationId?: string;
  organizationName?: string;
  webProject?: ProjectState;
  serverProject?: ProjectState;
  totpSecret?: string;
  recoveryCodes?: string[];
  deleted?: boolean;
}

function readState(): JourneyState {
  if (!existsSync(STATE_FILE)) {
    throw new Error(
      'The sign-up test did not create the user; see its failure.'
    );
  }
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as JourneyState;
}

function writeState(patch: Partial<JourneyState>): JourneyState {
  const next = { ...(existsSync(STATE_FILE) ? readState() : {}), ...patch };
  writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
  return next as JourneyState;
}

/** Continue as the journey's user: its cookies, and the feedback card already dismissed. */
async function continueAsUser(
  context: BrowserContext,
  baseURL: string | undefined
): Promise<JourneyState> {
  const state = readState();
  await context.addCookies([
    ...state.cookies,
    {
      name: 'feedback-prompt-seen',
      value: new Date().toISOString(),
      url: baseURL ?? '',
    },
  ]);
  return state;
}

async function rememberCookies(context: BrowserContext): Promise<void> {
  writeState({ cookies: await context.cookies() });
}

function otpInput(scope: Page | ReturnType<Page['getByRole']>) {
  return scope.locator('input[data-input-otp]');
}

function resetTokenFor(email: string): string {
  const databaseUrl = (process.env.DATABASE_URL ?? '').split('?')[0] ?? '';
  return execFileSync('psql', [
    databaseUrl,
    '-Atc',
    `select rp.id from reset_password rp join accounts a on a.id = rp."accountId" join users u on u.id = a."userId" where u.email = '${email}'`,
  ])
    .toString()
    .trim();
}

function canReadDatabase(): boolean {
  if (!process.env.DATABASE_URL) {
    return false;
  }
  try {
    execFileSync('psql', ['--version']);
    return true;
  } catch {
    return false;
  }
}

test('sign-up validates every field before it calls the API', async ({
  page,
}) => {
  const issues = watchIssues(page);
  let signUpRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/trpc/auth.signUpEmail')) {
      signUpRequests += 1;
    }
  });
  await gotoHydrated(page, '/onboarding');
  await expect(
    page.getByRole('heading', { name: 'Start tracking in minutes' })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/login'
  );

  const submit = page.getByRole('button', { name: 'Create account' });
  await submit.click();
  await expect(page.getByText('Issues')).toHaveCount(5);

  await page.getByLabel('First name').fill('E2E');
  await page.getByLabel('Last name').fill('Auth');
  await page.getByLabel('Email').fill(`e2e-auth-${RUN_ID}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByLabel('Confirm password').fill('short');
  await submit.click();
  await expect(page.getByText('Issues')).toHaveCount(2);

  await page.getByLabel('Password', { exact: true }).fill('long-enough-1');
  await page.getByLabel('Confirm password').fill('long-enough-2');
  await submit.click();
  await expect(page.getByText('Issues')).toHaveCount(1);
  await page.getByText('Issues').hover();
  await expect(page.getByRole('tooltip')).toContainText(
    'Passwords do not match'
  );
  await page.screenshot({ path: `${SHOTS_DIR}/sign-up-validation.png` });

  expect(signUpRequests).toBe(0);
  expect(issues.unexpected()).toEqual([]);
});

test('sign up creates the account and opens the project step', async ({
  page,
  context,
}) => {
  const issues = watchIssues(page);
  const email = `e2e-auth-${RUN_ID}@example.com`;
  const password = `pw-${RUN_ID}-first`;
  await gotoHydrated(page, '/onboarding');
  await page.getByLabel('First name').fill('E2E');
  await page.getByLabel('Last name').fill('Auth');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password').fill(password);
  await page.getByLabel('Confirm password').press('Enter');

  // No organization yet: `/` forwards to the project step.
  await expect(page).toHaveURL(/\/onboarding\/project$/, { timeout: 20_000 });
  const cookies = await context.cookies();
  expect(cookies.find((cookie) => cookie.name === 'session')).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  });
  writeState({ email, password, cookies });
  expect(issues.unexpected()).toEqual([]);
});

test('signing up again with the same email is refused', async ({ page }) => {
  const state = readState();
  await gotoHydrated(page, '/onboarding');
  await page.getByLabel('First name').fill('E2E');
  await page.getByLabel('Last name').fill('Twin');
  await page.getByLabel('Email').fill(state.email);
  await page.getByLabel('Password', { exact: true }).fill('another-password');
  await page.getByLabel('Confirm password').fill('another-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(toast(page, 'User already exists')).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding$/);
});

test('the project step validates the workspace, the name, the type and the domain', async ({
  page,
  context,
  baseURL,
}) => {
  await continueAsUser(context, baseURL);
  const issues = watchIssues(page);
  let projectRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/trpc/onboarding.project')) {
      projectRequests += 1;
    }
  });
  await gotoHydrated(page, '/onboarding/project');
  await expect(page.getByText('Create project')).toBeVisible();
  // Nothing to reuse yet.
  await expect(
    page.getByRole('button', { name: 'Use existing workspace' })
  ).toBeDisabled();

  const next = page.getByRole('button', { name: 'Next' });
  await next.click();
  await expect(
    page.getByText('At least one type must be selected')
  ).toBeVisible();
  await expect(page.getByText('Issues')).toHaveCount(2);

  await page.getByLabel('Workspace name').fill(`E2E auth ${RUN_ID}`);
  await page.getByLabel('Your first project name').fill('ab');
  await page.getByText('Website', { exact: true }).click();
  await next.click();
  // Too short a name, and a website needs its domain.
  await expect(page.getByText('Issues')).toHaveCount(2);
  await page.screenshot({
    path: `${SHOTS_DIR}/onboarding-project-invalid.png`,
  });

  // App and backend projects have no domain to ask for.
  await page.getByText('Website', { exact: true }).click();
  await expect(page.getByLabel('Domain')).toBeHidden();
  await page.getByText('App', { exact: true }).click();
  await next.click();
  await expect(page.getByText('Issues')).toHaveCount(1);

  expect(projectRequests).toBe(0);
  expect(issues.unexpected()).toEqual([]);
});

test('the timezone picker searches and keeps the choice', async ({
  page,
  context,
  baseURL,
}) => {
  await continueAsUser(context, baseURL);
  await gotoHydrated(page, '/onboarding/project');
  const timezone = page.getByRole('combobox').first();
  // Defaults to the browser's zone.
  await expect(timezone).toHaveText(/\w+\/\w+|UTC/);
  await timezone.click();
  await page.getByPlaceholder(/search/i).fill('Tokyo');
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.getByRole('option', { name: 'Asia/Tokyo' }).click();
  await expect(timezone).toHaveText('Asia/Tokyo');

  await timezone.click();
  await page.getByPlaceholder(/search/i).fill('UTC');
  await page.getByRole('option', { name: 'UTC', exact: true }).click();
  await expect(timezone).toHaveText('UTC');

  await timezone.click();
  await page.getByPlaceholder(/search/i).fill('no-such-zone');
  await expect(page.getByRole('option')).toHaveCount(0);
});

test('a website project leads to the connect step with its one-time credentials', async ({
  page,
  context,
  baseURL,
}) => {
  await continueAsUser(context, baseURL);
  const issues = watchIssues(page);
  const organizationName = `E2E auth ${RUN_ID}`;
  await gotoHydrated(page, '/onboarding/project');
  await page.getByLabel('Workspace name').fill(organizationName);
  await page.getByRole('combobox').first().click();
  await page.getByPlaceholder(/search/i).fill('UTC');
  await page.getByRole('option', { name: 'UTC', exact: true }).click();
  await page
    .getByLabel('Your first project name')
    .fill(`E2E auth web ${RUN_ID}`);
  await page.getByText('Website', { exact: true }).click();

  // A bare host becomes an origin, and that origin is allowed by default.
  const domain = `e2e-auth-${RUN_ID}.example.com`;
  await page.getByLabel('Domain').fill(domain);
  await page.getByLabel('Domain').blur();
  await expect(page.getByLabel('Domain')).toHaveValue(`https://${domain}`);
  await page
    .getByText('will be allowed. Do you want to allow any other?')
    .click();
  await expect(
    page.getByText(`https://${domain}`, { exact: true }).last()
  ).toBeVisible();
  await page.screenshot({
    path: `${SHOTS_DIR}/onboarding-project-website.png`,
  });

  const created = page.waitForResponse((response) =>
    response.url().includes('/trpc/onboarding.project')
  );
  await page.getByRole('button', { name: 'Next' }).click();
  const client = (await (await created).json()).result.data.json;
  await expect(page).toHaveURL(
    new RegExp(`/onboarding/${client.projectId}/connect$`)
  );
  await expect(page.getByText('Client credentials')).toBeVisible();
  writeState({
    organizationId: client.organizationId,
    organizationName,
    webProject: {
      id: client.projectId,
      clientId: client.id,
      clientSecret: client.secret,
    },
  });

  await expect(page.getByText(client.id).first()).toBeVisible();
  await expect(page.getByText(client.secret)).toBeVisible();
  await expect(
    page.getByText(btoa(`${client.id}:${client.secret}`))
  ).toBeVisible();
  await expect(page.locator('code').first()).toContainText(
    `clientId: '${client.id}'`
  );
  await expect(
    page.locator('button').filter({ has: page.locator('.font-semibold') })
  ).toHaveCount(FRAMEWORK_COUNT);
  await page.screenshot({
    path: `${SHOTS_DIR}/onboarding-connect.png`,
    fullPage: true,
  });

  // Each framework opens its instructions next to the page.
  for (const framework of ['Next.js', 'Rest API', 'iOS (swift)']) {
    await page.getByRole('button', { name: framework, exact: true }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.locator(`iframe[title="${framework}"]`)).toBeVisible();
    await sheet.getByRole('button', { name: 'Close' }).first().click();
    await expect(sheet).toBeHidden();
  }

  // The secret is stored hashed: after a reload in a new tab it cannot be shown again.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByText('Client credentials')).toBeVisible();
  await expect(page.getByText(client.secret)).toHaveCount(0);
  await expect(page.getByText('is only shown once')).toBeVisible();
  expect(issues.unexpected()).toEqual([]);
});

// Open defect: TanStack's `Link` builds its href from `to`, so a LinkButton's
// `href` is dropped and `target="_blank"` links open the page you are already on.
test('"More details" in the framework instructions links to the docs', async ({
  page,
  context,
  baseURL,
}) => {
  const state = await continueAsUser(context, baseURL);
  await gotoHydrated(page, `/onboarding/${state.webProject?.id}/connect`);
  await page.getByRole('button', { name: 'Next.js', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('link', { name: 'More details' })
  ).toHaveAttribute('href', /^https:\/\/openpanel\.dev\/docs/);
});

test('the verify step turns green when the first event arrives', async ({
  page,
  context,
  baseURL,
}) => {
  const state = await continueAsUser(context, baseURL);
  const project = state.webProject;
  if (!project) {
    throw new Error('The website project was not created; see its failure.');
  }
  const issues = watchIssues(page);
  await gotoHydrated(page, `/onboarding/${project.id}/connect`);
  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page).toHaveURL(new RegExp(`/onboarding/${project.id}/verify$`));
  await expect(page.getByText('Waiting for events')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Skip for now' })).toBeVisible();

  await page.getByRole('button', { name: 'No events received?' }).click();
  await expect(page.getByText('Ensure client ID is correct')).toBeVisible();
  await expect(page.getByText(project.clientId).first()).toBeVisible();
  await page.getByRole('button', { name: 'Personal curl example' }).click();
  await expect(page.locator('code').last()).toContainText(
    `openpanel-client-id: ${project.clientId}`
  );
  await page.screenshot({
    path: `${SHOTS_DIR}/onboarding-verify-waiting.png`,
    fullPage: true,
  });

  // Back and forward keep the step.
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page).toHaveURL(/\/connect$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/verify$/);
  await expect(page.getByText('Waiting for events')).toBeVisible();

  expect(
    trackEvent(
      { id: project.clientId, secret: project.clientSecret },
      'e2e_auth_first_event'
    )
  ).toBe('200');
  await expect(page.getByText('Successfully connected')).toBeVisible({
    timeout: EVENT_ARRIVAL_TIMEOUT_MS,
  });
  await expect(page.getByText('e2e_auth_first_event')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Skip for now' })).toHaveCount(0);
  await page.screenshot({
    path: `${SHOTS_DIR}/onboarding-verify-connected.png`,
  });

  await page.getByRole('link', { name: 'Your dashboard' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${state.organizationId}/${project.id}$`)
  );
  expect(issues.unexpected()).toEqual([]);
});

test('an app and backend project can be added to the existing workspace', async ({
  page,
  context,
  baseURL,
}) => {
  const state = await continueAsUser(context, baseURL);
  const issues = watchIssues(page);
  await gotoHydrated(page, '/onboarding/project');
  // With a workspace in hand, reusing it is the default.
  await expect(page.getByLabel('Workspace name')).toHaveCount(0);
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: state.organizationName }).click();
  await page
    .getByLabel('Your first project name')
    .fill(`E2E auth server ${RUN_ID}`);
  await page.getByText('App', { exact: true }).click();
  await page.getByText('Backend / API', { exact: true }).click();
  await expect(page.getByLabel('Domain')).toBeHidden();

  const created = page.waitForResponse((response) =>
    response.url().includes('/trpc/onboarding.project')
  );
  await page.getByRole('button', { name: 'Next' }).click();
  const client = (await (await created).json()).result.data.json;
  expect(client.organizationId).toBe(state.organizationId);
  await expect(page.getByText('Client credentials')).toBeVisible();
  await expect(page.getByText(client.secret)).toBeVisible();
  writeState({
    serverProject: {
      id: client.projectId,
      clientId: client.id,
      clientSecret: client.secret,
    },
  });

  await page.getByRole('link', { name: 'Next' }).click();
  await expect(page).toHaveURL(/\/verify$/);
  await page.getByRole('button', { name: 'Personal curl example' }).click();
  // A backend project gets a server-side example, with the real secret while it is known.
  const example = page.locator('code').last();
  await expect(example).toContainText('"name":"test_event"');
  await expect(example).toContainText(
    `openpanel-client-secret: ${client.secret}`
  );

  await page.getByRole('link', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/${state.organizationId}/${client.projectId}$`)
  );
  expect(issues.unexpected()).toEqual([]);
});

test('the onboarding steps fit a phone screen', async ({
  page,
  context,
  baseURL,
}) => {
  const state = await continueAsUser(context, baseURL);
  await page.setViewportSize(MOBILE_VIEWPORT);
  for (const [name, path] of [
    ['project', '/onboarding/project'],
    ['connect', `/onboarding/${state.webProject?.id}/connect`],
    ['verify', `/onboarding/${state.webProject?.id}/verify`],
    ['account', `/${state.organizationId}/account`],
    ['two-factor', `/${state.organizationId}/account/two-factor`],
  ] as const) {
    await gotoHydrated(page, path);
    expect(await hasHorizontalOverflow(page), path).toBe(false);
    await page.screenshot({
      path: `${SHOTS_DIR}/mobile-${name}.png`,
      fullPage: true,
    });
  }
});

test('the profile tab edits the name and keeps it after a reload', async ({
  page,
  context,
  baseURL,
}) => {
  const state = await continueAsUser(context, baseURL);
  const issues = watchIssues(page);
  // `/account` finds the organization by itself.
  await gotoHydrated(page, '/account');
  await expect(page).toHaveURL(new RegExp(`/${state.organizationId}/account$`));
  await expect(page.getByLabel('Email')).toHaveValue(state.email);
  await expect(page.getByLabel('Email')).toBeDisabled();
  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();

  await page.getByLabel('First name').fill('Renamed');
  await page.getByLabel('Last name').fill('Tester');
  await expect(save).toBeEnabled();
  await page.getByLabel('Last name').press('Enter');
  await expect(toast(page, 'Profile updated')).toBeVisible();
  await expect(save).toBeDisabled();

  await page.reload();
  await expect(page.getByLabel('First name')).toHaveValue('Renamed');
  await expect(page.getByLabel('Last name')).toHaveValue('Tester');
  await page.screenshot({ path: `${SHOTS_DIR}/account-profile.png` });
  expect(issues.unexpected()).toEqual([]);
});

// Open defect: the form's own schema accepts '', the API does not, and the
// toast prints the raw Zod issues.
test('an empty first name is refused with a readable message', async ({
  page,
  context,
  baseURL,
}) => {
  const state = await continueAsUser(context, baseURL);
  await gotoHydrated(page, `/${state.organizationId}/account`);
  await page.getByLabel('First name').fill('');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Issues').or(toast(page, /./))).toBeVisible();
  await expect(page.getByText('"code": "too_small"')).toHaveCount(0);
});

test('email preferences save per category and survive a reload', async ({
  page,
  context,
  baseURL,
}) => {
  const state = await continueAsUser(context, baseURL);
  const issues = watchIssues(page);
  await gotoHydrated(page, `/${state.organizationId}/account`);
  await page.getByRole('tab', { name: 'Email preferences' }).click();
  await expect(page).toHaveURL(/\/account\/email-preferences$/);

  const switches = page.getByRole('switch');
  await expect(switches.first()).toBeChecked();
  const categories = await switches.count();
  expect(categories).toBeGreaterThan(1);
  const save = page.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();

  await switches.first().click();
  await switches.last().click();
  await save.click();
  await expect(toast(page, 'Email preferences updated')).toBeVisible();

  await page.reload();
  await expect(switches.first()).not.toBeChecked();
  await expect(switches.last()).not.toBeChecked();
  await expect(switches.nth(1)).toBeChecked();
  await page.screenshot({ path: `${SHOTS_DIR}/account-email-preferences.png` });

  await switches.first().click();
  await switches.last().click();
  await save.click();
  await expect(toast(page, 'Email preferences updated')).toBeVisible();
  await page.reload();
  await expect(switches.first()).toBeChecked();
  expect(issues.unexpected()).toEqual([]);
});

// A wrong code must not be a 401: the dashboard treats every 401 as "session
// gone" and hard-navigates to /login.
test('a mistyped code while enabling two-factor keeps the setup open', async ({
  page,
  context,
  baseURL,
}) => {
  const state = await continueAsUser(context, baseURL);
  await gotoHydrated(page, `/${state.organizationId}/account/two-factor`);
  await page.getByRole('button', { name: 'Enable' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByAltText('Authenticator QR code')).toBeVisible();
  const secret =
    (await dialog.innerText()).match(TOTP_SECRET_PATTERN)?.[0] ?? '';
  await otpInput(dialog).fill(wrongTotpCode(secret));
  await dialog.getByRole('button', { name: 'Enable' }).click();
  await expect(toast(page, 'Invalid code')).toBeVisible();
  await expect(dialog.getByAltText('Authenticator QR code')).toBeVisible();
  await expect(page).toHaveURL(/\/account\/two-factor$/);
});

test('two-factor can be enabled and its recovery codes regenerated', async ({
  page,
  context,
  baseURL,
}) => {
  const state = await continueAsUser(context, baseURL);
  const issues = watchIssues(page);
  await gotoHydrated(page, `/${state.organizationId}/account`);
  await page.getByRole('tab', { name: 'Two-factor auth' }).click();
  await expect(page).toHaveURL(/\/account\/two-factor$/);
  await expect(
    page.getByText('Two-factor authentication is disabled.')
  ).toBeVisible();

  await page.getByRole('button', { name: 'Enable' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByAltText('Authenticator QR code')).toBeVisible();
  const enable = dialog.getByRole('button', { name: 'Enable' });
  await expect(enable).toBeDisabled();
  const secret = (await dialog.innerText()).match(TOTP_SECRET_PATTERN)?.[0];
  if (!secret) {
    throw new Error('The setup modal did not show a secret to type manually.');
  }
  await page.screenshot({ path: `${SHOTS_DIR}/two-factor-setup.png` });

  await otpInput(dialog).fill(totpCode(secret));
  await enable.click();
  await expect(dialog.getByText('Save your recovery codes')).toBeVisible();
  const firstCodes: string[] =
    (await dialog.innerText()).match(RECOVERY_CODE_PATTERN) ?? [];
  expect(new Set(firstCodes).size).toBe(RECOVERY_CODE_COUNT);
  await expect(dialog.getByRole('button', { name: 'Download' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Copy all' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS_DIR}/two-factor-recovery-codes.png` });
  writeState({ totpSecret: secret, recoveryCodes: firstCodes });

  await dialog.getByRole('button', { name: "I've saved my codes" }).click();
  await expect(
    page.getByText('Two-factor authentication is enabled.')
  ).toBeVisible();
  await expect(
    page.getByText(`${RECOVERY_CODE_COUNT} recovery codes remaining`)
  ).toBeVisible();

  await page.getByRole('button', { name: 'Regenerate recovery codes' }).click();
  const regenerate = dialog.getByRole('button', { name: 'Regenerate' });
  await expect(regenerate).toBeDisabled();
  await otpInput(dialog).fill(totpCode(secret));
  await regenerate.click();
  await expect(dialog.getByText('New recovery codes')).toBeVisible();
  const newCodes =
    (await dialog.innerText()).match(RECOVERY_CODE_PATTERN) ?? [];
  expect(new Set(newCodes).size).toBe(RECOVERY_CODE_COUNT);
  expect(newCodes.some((code) => firstCodes.includes(code))).toBe(false);
  writeState({ recoveryCodes: newCodes });
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await page.screenshot({ path: `${SHOTS_DIR}/two-factor-enabled.png` });
  expect(issues.unexpected()).toEqual([]);
});

// The same on /verify: a 401 would send the visitor back to /login without
// ever showing "Invalid code".
test('a mistyped code on /verify says so and lets the visitor try again', async ({
  page,
}) => {
  const state = readState();
  test.skip(!state.totpSecret, 'two-factor was not enabled');
  await gotoHydrated(page, '/login');
  await submitSignIn(page, state);
  await expect(page).toHaveURL(/\/verify$/);
  await waitForHydration(page);
  await otpInput(page).fill(wrongTotpCode(state.totpSecret ?? ''));
  await expect(toast(page, 'Invalid code')).toBeVisible();
  await expect(page).toHaveURL(/\/verify$/);
});

test('signing in asks for the authenticator code', async ({
  page,
  context,
}) => {
  const state = readState();
  test.skip(!state.totpSecret, 'two-factor was not enabled');
  const issues = watchIssues(page);

  // Without a pending challenge there is nothing to verify.
  await gotoHydrated(page, '/verify');
  await expect(
    page.getByRole('heading', { name: 'Two-factor authentication' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verify' })).toBeDisabled();
  await expect(
    page.getByRole('link', { name: 'Sign in with a different account' })
  ).toHaveAttribute('href', '/login');

  await page.goto('/login');
  await waitForHydration(page);
  await submitSignIn(page, state);
  await expect(page).toHaveURL(/\/verify$/);
  // The password alone is not a session.
  expect((await context.cookies()).map((cookie) => cookie.name)).not.toContain(
    'session'
  );
  await page.goto(`/${state.organizationId}`);
  await expect(page).toHaveURL(/\/login$/);

  await gotoHydrated(page, '/verify');
  await page.screenshot({ path: `${SHOTS_DIR}/two-factor-verify.png` });
  await page
    .getByRole('button', { name: 'Use a recovery code instead' })
    .click();
  await expect(page.getByPlaceholder('ABCDE-FGHIJ')).toBeVisible();
  await page
    .getByRole('button', { name: 'Use authenticator app instead' })
    .click();
  // Six digits submit by themselves.
  await otpInput(page).fill(totpCode(state.totpSecret ?? ''));
  await expect(page).toHaveURL(new RegExp(`/${state.organizationId}$`), {
    timeout: 20_000,
  });
  expect((await context.cookies()).map((cookie) => cookie.name)).toContain(
    'session'
  );
  expect(issues.unexpected()).toEqual([]);
});

test('a recovery code signs in once and is then used up', async ({
  page,
  context,
}) => {
  const state = readState();
  const recoveryCode = state.recoveryCodes?.[0];
  test.skip(!recoveryCode, 'two-factor was not enabled');
  const issues = watchIssues(page);
  await gotoHydrated(page, '/login');
  await submitSignIn(page, state);
  await expect(page).toHaveURL(/\/verify$/);
  await waitForHydration(page);
  await page
    .getByRole('button', { name: 'Use a recovery code instead' })
    .click();
  // Typed in lower case: codes are case-insensitive.
  await page
    .getByPlaceholder('ABCDE-FGHIJ')
    .fill((recoveryCode ?? '').toLowerCase());
  await page.getByPlaceholder('ABCDE-FGHIJ').press('Enter');
  await expect(page).toHaveURL(new RegExp(`/${state.organizationId}$`), {
    timeout: 20_000,
  });
  await rememberCookies(context);

  await page.goto(`/${state.organizationId}/account/two-factor`);
  await expect(
    page.getByText(`${RECOVERY_CODE_COUNT - 1} recovery codes remaining`)
  ).toBeVisible();

  // The same code is refused the second time.
  const reuse = await page.request.post(`${apiUrl()}/trpc/auth.totpDisable`, {
    data: { json: { code: recoveryCode } },
  });
  expect(reuse.status()).toBe(400);
  expect((await reuse.json()).error.json.message).toBe('Invalid code');
  expect(issues.unexpected()).toEqual([]);
});

test('two-factor can be disabled with an authenticator code', async ({
  page,
  context,
  baseURL,
}) => {
  const state = await continueAsUser(context, baseURL);
  test.skip(!state.totpSecret, 'two-factor was not enabled');
  const issues = watchIssues(page);
  await gotoHydrated(page, `/${state.organizationId}/account/two-factor`);
  await page.getByRole('button', { name: 'Disable' }).click();
  const dialog = page.getByRole('dialog');
  const disable = dialog.getByRole('button', { name: 'Disable' });
  await expect(disable).toBeDisabled();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Disable' }).click();
  await dialog
    .getByPlaceholder('123456 or ABCDE-FGHIJ')
    .fill(totpCode(state.totpSecret ?? ''));
  await disable.click();
  await expect(toast(page, 'Two-factor authentication disabled')).toBeVisible();
  await expect(
    page.getByText('Two-factor authentication is disabled.')
  ).toBeVisible();
  writeState({ totpSecret: undefined, recoveryCodes: undefined });
  expect(issues.unexpected()).toEqual([]);
});

test('a reset link sets a new password and works only once', async ({
  page,
}) => {
  test.skip(
    !canReadDatabase(),
    'needs psql and DATABASE_URL to read the token'
  );
  const state = readState();
  const issues = watchIssues(page);
  await gotoHydrated(page, '/login');
  await page.getByLabel('Email').fill(state.email);
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByPlaceholder('Your email address')).toHaveValue(
    state.email
  );
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(
    toast(page, 'You should receive an email shortly!')
  ).toBeVisible();

  const token = resetTokenFor(state.email);
  expect(token).toMatch(/^pw_/);
  const newPassword = `pw-${RUN_ID}-second`;
  await gotoHydrated(page, `/reset-password?token=${token}`);
  await page.getByLabel('New password').fill(newPassword);
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(toast(page, 'Password reset successfully')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  writeState({ password: newPassword });

  await waitForHydration(page);
  const response = await submitSignIn(page, {
    email: state.email,
    password: newPassword,
  });
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`/${state.organizationId}$`), {
    timeout: 20_000,
  });

  const reuse = await page.request.post(`${apiUrl()}/trpc/auth.resetPassword`, {
    data: { json: { token, password: 'yet-another-password' } },
  });
  expect(reuse.status()).toBe(404);
  expect(issues.unexpected()).toEqual([]);
});

test('deleting the account needs the typed confirmation and ends the session', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  const state = await continueAsUser(context, baseURL);
  const issues = watchIssues(page);
  const sessionCookie = state.cookies.find(
    (cookie) => cookie.name === 'session'
  );
  try {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await gotoHydrated(page, `/${state.organizationId}/account`);
    await page.getByRole('button', { name: 'Delete account' }).click();
    const dialog = page.getByRole('dialog');
    const confirm = dialog.getByRole('button', { name: 'Delete account' });
    await expect(confirm).toBeDisabled();
    await dialog.getByPlaceholder('DELETE').fill('delete');
    await expect(confirm).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Delete account' }).click();
    await dialog.getByPlaceholder('DELETE').fill('DELETE');
    await page.screenshot({ path: `${SHOTS_DIR}/account-delete-confirm.png` });
    await confirm.click();
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
    writeState({ deleted: true });
  } finally {
    if (!readState().deleted) {
      // Never leave the throwaway user behind when the modal is what broke.
      await request.post(`${apiUrl()}/trpc/user.delete`, {
        data: {},
        headers: { cookie: `session=${sessionCookie?.value}` },
      });
    }
  }

  const session = await request.get(`${apiUrl()}/trpc/auth.session`, {
    headers: { cookie: `session=${sessionCookie?.value}` },
  });
  expect((await session.json()).result.data.json.userId).toBeNull();
  expect(issues.unexpected()).toEqual([]);
});

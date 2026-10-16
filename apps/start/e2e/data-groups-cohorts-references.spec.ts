import type { Page } from '@playwright/test';
import { expect as baseExpect, test } from './fixtures';

// The dev server shares a machine with other suites; default timeouts are too tight.
const expect = baseExpect.configure({ timeout: 30_000 });
test.describe.configure({ timeout: 300_000 });

const SHOTS = 'test-results/data/shots';
const SHOP = '/acme/acme-shop';
const SAAS = '/acme/acme-saas';
const STAMP = Date.now();
const NOISE = [
  /api\.openpanel\.dev/,
  /favicon/,
  /sentry/i,
  /\[vite\]/,
  /Failed to load resource/,
  // The sidebar's AI composer input (not this surface) differs in a `style` attribute.
  /A tree hydrated but some attributes/,
  /requires a `DialogTitle`/,
  /Missing `Description`/,
];

function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') {
      return;
    }
    const text = message.text();
    if (!NOISE.some((pattern) => pattern.test(text))) {
      problems.push(`console: ${text.slice(0, 400)}`);
    }
  });
  page.on('pageerror', (error) => {
    problems.push(`pageerror: ${error.message.slice(0, 400)}`);
  });
  page.on('response', (response) => {
    const url = response.url();
    if (response.status() >= 400 && !NOISE.some((p) => p.test(url))) {
      problems.push(`http ${response.status()}: ${url.slice(0, 200)}`);
    }
  });
  return problems;
}

async function hydrated(page: Page) {
  await page.waitForLoadState('networkidle');
  // The project switcher only gets its label once the client has hydrated.
  await expect(page.getByRole('combobox').first()).toContainText('Acme', {
    timeout: 45_000,
  });
}

async function open(page: Page, path: string) {
  await page.context().addCookies([
    {
      name: 'feedback-prompt-seen',
      value: new Date().toISOString(),
      url: process.env.DASHBOARD_URL ?? 'http://localhost:3000',
    },
  ]);
  for (const attempt of [1, 2, 3]) {
    await page.goto(path);
    try {
      await hydrated(page);
      return;
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
    }
  }
}

const shot = (page: Page, name: string, fullPage = false) =>
  page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage });

test.describe('groups', () => {
  const groupId = `e2e-data-${STAMP}`;
  const groupName = `E2E data ${STAMP}`;

  test('add, open, edit and delete a group', async ({ page }) => {
    const problems = watch(page);
    await open(page, `${SAAS}/groups`);
    await page.getByRole('button', { name: 'Add group' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Add group')).toBeVisible();

    // Validation: a dirty but incomplete form must say what is missing.
    await dialog.getByLabel('Name').fill(groupName);
    await dialog.getByRole('button', { name: 'Create' }).click();
    await shot(page, 'group-add-validation');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('ID').fill(groupId);
    await dialog.getByLabel('Type').fill('e2e-company');
    await dialog.getByRole('button', { name: 'Add', exact: true }).click();
    await dialog.getByPlaceholder('key').fill('plan');
    await dialog.getByPlaceholder('value').fill('enterprise');
    await shot(page, 'group-add');
    await dialog.getByLabel('Type').press('Enter');
    await expect(page.getByText('Group created.')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const row = page.locator('tbody tr', { hasText: groupName });
    await expect(row).toBeVisible();
    await shot(page, 'groups-list');

    await page.getByPlaceholder(/Search/).fill(groupName);
    await expect(page).toHaveURL(/search=/);
    await expect(row).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(1);

    await row.getByRole('link').first().click();
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}$`));
    await hydrated(page);
    await expect(page.getByText(groupName).first()).toBeVisible();
    await page.waitForTimeout(1500);
    await shot(page, 'group-detail', true);
    await expect(page.getByText('enterprise').first()).toBeVisible();

    await page.getByRole('tab', { name: 'Members' }).click();
    await expect(page).toHaveURL(/\/members/);
    await page.waitForLoadState('networkidle');
    await shot(page, 'group-members');
    await page.getByRole('tab', { name: 'Events' }).click();
    await expect(page).toHaveURL(/\/events/);
    await page.waitForLoadState('networkidle');
    await shot(page, 'group-events');
    await page.reload();
    await hydrated(page);
    await expect(page.getByText(groupName).first()).toBeVisible();
    await page.getByRole('tab', { name: 'Overview' }).click();

    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(dialog.getByText('Edit group')).toBeVisible();
    await shot(page, 'group-edit');
    await dialog.getByLabel('Name').fill(`${groupName} edited`);
    await dialog.getByPlaceholder('value').fill('scale');
    await dialog.getByRole('button', { name: /Update|Save/ }).click();
    await expect(page.getByText('Group updated.')).toBeVisible();
    await expect(page.getByText(`${groupName} edited`).first()).toBeVisible();
    await expect(page.getByText('scale').first()).toBeVisible();
    await shot(page, 'group-edited', true);

    await page.getByRole('button', { name: 'Delete' }).click();
    await shot(page, 'group-delete-confirm');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Yes|Delete|Confirm/ })
      .click();
    await expect(page).toHaveURL(/\/groups$/);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(`${groupName} edited`)).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('mobile viewport has no horizontal page scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, `${SAAS}/groups`);
    await shot(page, 'groups-mobile');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('references', () => {
  const title = `E2E data ${STAMP}`;

  test('add, edit and delete a reference; it marks the overview chart', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page, `${SHOP}/references`);
    await page.getByRole('button', { name: 'Create reference' }).last().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Add reference')).toBeVisible();
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByLabel('Description').fill('created by the data spec');
    await shot(page, 'reference-add');
    await dialog.getByLabel('Description').press('Enter');
    await expect(page.getByText('Success').first()).toBeVisible();
    const row = page.locator('tbody tr', { hasText: title });
    await expect(row).toBeVisible();
    await shot(page, 'references-list');

    await open(page, SHOP);
    await page.waitForTimeout(3000);
    await shot(page, 'reference-overview', true);
    const flag = page.locator('svg.lucide-flag').first();
    await expect(flag).toBeVisible();
    await flag.hover();
    await expect(page.getByText(title).first()).toBeVisible();
    await shot(page, 'reference-overview-hover');

    await open(page, `${SHOP}/references`);
    await row.getByRole('button').last().click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(dialog.getByText('Edit reference')).toBeVisible();
    await dialog.getByLabel('Title').fill(`${title} edited`);
    await shot(page, 'reference-edit');
    await dialog.getByRole('button', { name: /Save|Update/ }).click();
    await expect(page.getByText('Reference updated.')).toBeVisible();
    const editedRow = page.locator('tbody tr', { hasText: `${title} edited` });
    await expect(editedRow).toBeVisible();

    await editedRow.getByRole('button').last().click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await shot(page, 'reference-delete-confirm');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Yes|Delete|Confirm/ })
      .click();
    await expect(page.getByText('Reference deleted')).toBeVisible();
    await expect(editedRow).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('mobile viewport has no horizontal page scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, `${SHOP}/references`);
    await shot(page, 'references-mobile');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('cohorts', () => {
  const name = `E2E data ${STAMP} purchasers`;

  test('event-based cohort: create, count, tabs, edit, delete', async ({
    page,
  }) => {
    const problems = watch(page);
    await open(page, `${SHOP}/cohorts`);
    await page.getByRole('button', { name: /Create cohort|Cohort/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Create cohort')).toBeVisible();
    await shot(page, 'cohort-add-empty');

    await dialog.getByRole('button', { name: 'Add event criteria' }).click();
    await dialog.getByRole('button', { name: /Select event/ }).click();
    await page.getByPlaceholder('Search').last().fill('purchase');
    await page
      .getByRole('option', { name: /^purchase/ })
      .first()
      .click();
    await page.keyboard.press('Escape');
    await shot(page, 'cohort-add-event');

    // Submitting without a name must explain why nothing happened.
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await shot(page, 'cohort-add-no-name');
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Name').fill(name);
    await dialog.getByPlaceholder('Optional description').fill('bought once');
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByText('Cohort created.')).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
    await shot(page, 'cohorts-list');

    await page.getByRole('link', { name: new RegExp(name) }).click();
    await expect(page).toHaveURL(/\/cohorts\/[0-9a-f-]+$/);
    await hydrated(page);
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await shot(page, 'cohort-detail', true);
    await page.getByRole('tab', { name: 'Members' }).click();
    await expect(page).toHaveURL(/\/members/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await shot(page, 'cohort-members', true);
    await page.getByRole('tab', { name: 'Events' }).click();
    await expect(page).toHaveURL(/\/events/);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await shot(page, 'cohort-events', true);
    await page.reload();
    await hydrated(page);
    await page.getByRole('tab', { name: 'Overview' }).click();

    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(dialog).toBeVisible();
    await shot(page, 'cohort-edit');
    await dialog.getByLabel('Name').fill(`${name} edited`);
    await dialog.getByRole('button', { name: /Save|Update/ }).click();
    await expect(page.getByText(/Cohort updated/)).toBeVisible();
    await expect(page.getByText(`${name} edited`).first()).toBeVisible();

    await page.getByRole('button', { name: 'Delete' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Yes|Delete|Confirm/ })
      .click();
    await expect(page).toHaveURL(/\/cohorts$/);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(`${name} edited`)).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('a cohort of purchasers gets computed and has members', async ({
    page,
  }) => {
    const computed = `E2E data ${STAMP} computed`;
    await open(page, `${SHOP}/cohorts`);
    await page.getByRole('button', { name: /Create cohort|Cohort/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill(computed);
    await dialog.getByRole('button', { name: 'Add event criteria' }).click();
    await dialog.getByRole('button', { name: /Select event/ }).click();
    await page.getByPlaceholder('Search').last().fill('purchase');
    await page
      .getByRole('option', { name: /^purchase/ })
      .first()
      .click();
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByText('Cohort created.')).toBeVisible();
    await page.getByRole('link', { name: new RegExp(computed) }).click();
    await expect(page).toHaveURL(/\/cohorts\/[0-9a-f-]+$/);
    await hydrated(page);

    let members = 0;
    try {
      // The seed has ~90 shoppers with a purchase; the compute job is async.
      await expect
        .poll(
          async () => {
            await page.reload();
            await hydrated(page);
            await page.getByRole('tab', { name: 'Members' }).click();
            await page.waitForLoadState('networkidle');
            members = await page.locator('tbody tr a').count();
            return members;
          },
          { timeout: 90_000, intervals: [10_000] }
        )
        .toBeGreaterThan(0);
    } finally {
      await shot(page, 'cohort-computed', true);
      await page.getByRole('button', { name: 'Delete' }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /Yes|Delete|Confirm/ })
        .click();
      await expect(page).toHaveURL(/\/cohorts$/);
    }
  });

  test('the builder offers every criteria control and saves a combined definition', async ({
    page,
  }) => {
    const combined = `E2E data ${STAMP} combined`;
    const problems = watch(page);
    await open(page, `${SHOP}/cohorts`);
    await page.getByRole('button', { name: /Create cohort|Cohort/ }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill(combined);
    await dialog.locator('#isStatic').click();

    const pick = async (trigger: string | RegExp, item: string) => {
      await dialog.getByRole('button', { name: trigger }).last().click();
      await page.getByRole('menuitem', { name: item, exact: true }).click();
    };
    const pickEvent = async (eventName: string) => {
      await dialog
        .getByRole('button', { name: /Select event/ })
        .last()
        .click();
      await page.getByPlaceholder('Search').last().fill(eventName);
      await page
        .getByRole('option', { name: new RegExp(`^${eventName}`) })
        .first()
        .click();
      await page.keyboard.press('Escape');
    };

    await dialog.getByRole('button', { name: 'Add event criteria' }).click();
    await pickEvent('purchase');
    await pick('At least', 'Exactly');
    await dialog.locator('input[type="number"]').last().fill('2');
    await pick('Last', 'Since');
    await dialog.locator('input[type="date"]').last().fill('2026-09-20');
    await shot(page, 'cohort-builder-since');

    await dialog.getByRole('button', { name: 'Add event criteria' }).click();
    await pickEvent('add_to_cart');
    await pick('At least', 'At most');
    await dialog.locator('input[type="number"]').last().fill('0');
    await pick('Last', 'Between');
    await expect(dialog.locator('input[type="date"]')).toHaveCount(3);
    await pick('Between', 'Last');
    await pick('30 days', '7 days');
    await pick('Any', 'All of these events');
    await expect(
      dialog.getByRole('button', { name: 'All', exact: true })
    ).toBeVisible();

    await dialog.getByRole('button', { name: 'Add filter' }).first().click();
    await shot(page, 'cohort-builder-filter-picker');
    await page.getByPlaceholder('Search').last().fill('payment');
    await page.getByText('payment', { exact: true }).first().click();
    await shot(page, 'cohort-builder-filter');
    await dialog.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await shot(page, 'cohort-builder-bottom');

    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByText('Cohort created.')).toBeVisible();
    const card = page
      .locator('div', {
        has: page.getByRole('link', { name: new RegExp(combined) }),
      })
      .last();
    await expect(card.getByText('Static')).toBeVisible();
    await shot(page, 'cohorts-list-combined');

    // Edit from the card: the saved definition comes back as entered.
    await card.getByRole('button').first().click();
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(dialog.getByLabel('Name')).toHaveValue(combined);
    await shot(page, 'cohort-edit-combined');
    await expect(dialog.getByRole('button', { name: 'Exactly' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'At most' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Since' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '7 days' })).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'All', exact: true })
    ).toBeVisible();

    // Switch to a property-based definition.
    await dialog.getByRole('button', { name: 'Property-based' }).click();
    await dialog.getByRole('button', { name: 'Add property filter' }).click();
    await shot(page, 'cohort-builder-property-picker');
    await page.getByPlaceholder('Search').last().fill('country');
    await page.getByText('country', { exact: true }).first().click();
    await shot(page, 'cohort-builder-property');
    await dialog.getByRole('button', { name: /Save|Update/ }).click();
    await expect(page.getByText(/Cohort updated/)).toBeVisible();

    await card.getByRole('button').first().click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Yes|Delete|Confirm/ })
      .click();
    await expect(page.getByText('Cohort deleted.')).toBeVisible();
    await expect(page.getByText(combined)).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});

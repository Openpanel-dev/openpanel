import { expect, test } from './fixtures';
import { openHydrated } from './verify-a-helpers';

const IDLE_MS = 2000;

interface RouterWithQueryClient {
  options: {
    context: { queryClient: { invalidateQueries: () => Promise<void> } };
  };
}

test('an open member row menu stays open when the members table refetches', async ({
  page,
  seed,
}) => {
  await openHydrated(page, `/${seed.organizationId}/members/members`);
  const row = page.getByRole('row', { name: new RegExp(seed.user.email) });
  await row.getByRole('button').click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await page.waitForTimeout(IDLE_MS);
  await expect(menu, 'menu stays open while nothing happens').toBeVisible();

  // What an invite, a removed member or a window refocus does to the table.
  await page.evaluate(() =>
    (
      window as { __TSR_ROUTER__?: RouterWithQueryClient }
    ).__TSR_ROUTER__?.options.context.queryClient.invalidateQueries()
  );
  await page.waitForTimeout(IDLE_MS);
  await expect(menu, 'menu after the table refetched').toBeVisible();
  await page.keyboard.press('Escape');
});

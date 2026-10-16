import { expect, test } from './fixtures';
import { busiestProject } from './seed-manifest';

test('the organization lists the seeded projects', async ({ page, seed }) => {
  await page.goto(`/${seed.organizationId}`);
  for (const project of seed.projects) {
    await expect(page.getByText(project.name, { exact: true })).toBeVisible();
  }
});

test('the overview renders its metric cards for a seeded project', async ({
  page,
  seed,
}) => {
  const project = busiestProject(seed);
  await page.goto(`/${seed.organizationId}/${project.id}`);
  for (const metric of [
    'Unique Visitors',
    'Sessions',
    'Pageviews',
    'Bounce Rate',
  ]) {
    await expect(
      page.getByRole('button', { name: new RegExp(`^${metric}`) })
    ).toBeVisible();
  }
});

test('sessions and profiles pages list seeded rows', async ({ page, seed }) => {
  const project = busiestProject(seed);
  const base = `/${seed.organizationId}/${project.id}`;

  await page.goto(`${base}/sessions`);
  await expect(
    page.getByRole('heading', { name: 'Sessions', level: 1 })
  ).toBeVisible();
  await expect(
    page.locator(`a[href^="${base}/sessions/"]`).first()
  ).toBeVisible();

  await page.goto(`${base}/profiles`);
  await expect(
    page.locator(`a[href^="${base}/profiles/"]`).first()
  ).toBeVisible();
});

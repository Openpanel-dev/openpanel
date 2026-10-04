import { request as playwrightRequest } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  API_URL,
  openHydrated,
  SHOTS_DIR,
  trpcMutation,
  trpcQuery,
} from './verify-a-helpers';

const PASSWORD = 'Verify-a-pass-1!';
const VISIBLE_CARDS_BUDGET_MS = 10_000;

interface Project {
  id: string;
  deleteAt: string | null;
}

test('cancelling an organization deletion keeps a project that was already scheduled for deletion', async () => {
  const stamp = Date.now();
  const owner = await playwrightRequest.newContext({
    ignoreHTTPSErrors: true,
    baseURL: API_URL,
  });
  await trpcMutation(owner, 'auth.signUpEmail', {
    firstName: 'E2E',
    lastName: 'VerifyA',
    email: `e2e-verify-a-${stamp}@example.com`,
    password: PASSWORD,
    confirmPassword: PASSWORD,
  });
  const project = {
    domain: null,
    cors: [],
    website: false,
    app: false,
    backend: true,
  };
  await trpcMutation(owner, 'onboarding.project', {
    ...project,
    organization: `E2E verify-a ${stamp}`,
    project: `E2E verify-a keep ${stamp}`,
    timezone: 'UTC',
  });
  const [organization] = await trpcQuery<{ id: string }[]>(
    owner,
    'organization.list'
  );
  const organizationId = organization.id;
  const doomed = await trpcMutation<Project>(owner, 'project.create', {
    ...project,
    organizationId,
    project: `E2E verify-a doomed ${stamp}`,
  });
  const listProjects = () =>
    trpcQuery<Project[]>(owner, 'project.list', { organizationId });
  const deleteAtOf = async (projectId: string) =>
    (await listProjects()).find((item) => item.id === projectId)?.deleteAt ??
    null;

  try {
    await trpcMutation(owner, 'project.delete', { projectId: doomed.id });
    expect(await deleteAtOf(doomed.id)).not.toBeNull();

    await trpcMutation(owner, 'organization.delete', { organizationId });
    await trpcMutation(owner, 'organization.cancelDeletion', {
      organizationId,
    });

    const projects = await listProjects();
    const kept = projects.find((item) => item.id !== doomed.id);
    expect(kept?.deleteAt, 'the other project is restored').toBeNull();
    expect(
      await deleteAtOf(doomed.id),
      'the project deleted on its own is still scheduled for deletion'
    ).not.toBeNull();
  } finally {
    await trpcMutation(owner, 'organization.delete', { organizationId });
    await trpcMutation(owner, 'user.delete');
    await owner.dispose();
  }
});

test('the projects page fills every visible card and loads the rest on scroll', async ({
  page,
  seed,
}) => {
  await openHydrated(page, `/${seed.organizationId}`);
  const visibleSkeletonCards = () =>
    page.evaluate(
      () =>
        Array.from(document.querySelectorAll('.card')).filter((card) => {
          const box = card.getBoundingClientRect();
          const isVisible = box.bottom > 0 && box.top < window.innerHeight;
          return isVisible && card.querySelector('.animate-pulse') !== null;
        }).length
    );
  await expect
    .poll(visibleSkeletonCards, { timeout: VISIBLE_CARDS_BUDGET_MS })
    .toBe(0);
  await page.screenshot({ path: `${SHOTS_DIR}/projects-top.png` });

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect
    .poll(visibleSkeletonCards, { timeout: VISIBLE_CARDS_BUDGET_MS })
    .toBe(0);
  await page.screenshot({ path: `${SHOTS_DIR}/projects-bottom.png` });
});

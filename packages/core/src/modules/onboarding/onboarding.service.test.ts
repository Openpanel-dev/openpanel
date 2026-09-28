// Onboarding email cron: the sequential drip driven by the
// `organization.onboarding` pointer. Db, the organization module's event-count
// lookup, and email are mocked; asserts template selection, day gating, early
// completion on active subs, and usage personalization. `mock.module` is not
// hoisted, so the subject is imported inside `beforeAll` — see AGENTS.md.

import { afterAll, beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { subDays } from 'date-fns';
import { testCoreConfig } from '../../../test/config-fixture';

const organizationFindMany = mock(async () => [] as unknown[]);
const organizationUpdate = mock(async () => ({}));
const dbMock = {
  organization: { findMany: organizationFindMany, update: organizationUpdate },
};
// `runOnboardingCron` takes `ServiceDeps` now, so `deps.db` IS the fake below —
// no Prisma module mock needed.
const deps = {
  db: dbMock,
  config: testCoreConfig(),
} as unknown as import('../../services').ServiceDeps;

const getOrganizationEventsCount = mock(
  async (_deps: unknown, _projectIds: string[]) => 0
);
// Spread a plain-object SNAPSHOT of the real module, not a partial factory:
// `mock.module` replaces this specifier process-wide under bare `bun test`
// (AGENTS.md), and since M10-009 every cross-module caller reaches
// `getSettingsForProject` / `getOrganizationByProjectIdCached` through this
// deep path rather than the package barrel — a partial factory here silently
// deleted them for every file that ran afterwards.
const realOrganizationService = {
  ...(await import('../organization/organization.service')),
};
mock.module('../organization/organization.service', () => ({
  ...realOrganizationService,
  getOrganizationById: mock(async () => null),
  getOrganizationEventsCount,
  connectUserToOrganization: mock(async () => undefined),
}));

afterAll(() => {
  mock.module(
    '../organization/organization.service',
    () => realOrganizationService
  );
});

const sendEmail = mock(
  async (
    _template: string,
    _options: unknown
  ): Promise<Record<string, unknown> | null> => ({})
);
mock.module('../../clients/email', () => ({ sendEmail }));

let runOnboardingCron: typeof import('./onboarding.service').runOnboardingCron;

beforeAll(async () => {
  ({ runOnboardingCron } = await import('./onboarding.service'));
});

const logger = {
  info: mock(() => undefined),
  warn: mock(() => undefined),
  error: mock(() => undefined),
};

function org(overrides: Record<string, unknown> = {}) {
  return {
    id: 'org-1',
    createdAt: new Date(),
    onboarding: null,
    subscriptionStatus: 'trialing',
    subscriptionEndsAt: new Date('2026-06-16T12:00:00Z'),
    createdBy: {
      id: 'user-1',
      email: 'user@example.com',
      firstName: 'Alex',
      deletedAt: null,
    },
    projects: [{ id: 'proj-1' }],
    ...overrides,
  };
}

beforeEach(() => {
  organizationFindMany.mockClear();
  organizationUpdate.mockClear().mockResolvedValue({});
  getOrganizationEventsCount.mockClear().mockResolvedValue(0);
  sendEmail.mockClear().mockResolvedValue({});
  logger.info.mockClear();
  logger.warn.mockClear();
  logger.error.mockClear();
});

test('returns null and does nothing when self-hosted', async () => {
  const result = await runOnboardingCron(
    { ...deps, config: testCoreConfig({ selfHosted: true }) },
    logger
  );
  expect(result).toBeNull();
  expect(organizationFindMany).not.toHaveBeenCalled();
});

test('sends the welcome email on day 0 with hasData from clickhouse', async () => {
  getOrganizationEventsCount.mockResolvedValue(123);
  organizationFindMany.mockResolvedValue([org()]);

  const result = await runOnboardingCron(deps, logger);

  expect(result).toMatchObject({ emailsSent: 1 });
  expect(sendEmail).toHaveBeenCalledWith('onboarding-welcome', {
    to: 'user@example.com',
    data: expect.objectContaining({ firstName: 'Alex', hasData: true }),
  });
  expect(getOrganizationEventsCount).toHaveBeenCalledWith(deps, ['proj-1']);
  expect(organizationUpdate).toHaveBeenCalledWith({
    where: { id: 'org-1' },
    data: { onboarding: 'onboarding-welcome' },
  });
});

test('does not fetch usage for orgs that are gated on days', async () => {
  organizationFindMany.mockResolvedValue([
    org({
      onboarding: 'onboarding-welcome',
      createdAt: subDays(new Date(), 1), // next email is day 2
    }),
  ]);

  const result = await runOnboardingCron(deps, logger);

  expect(result).toMatchObject({ emailsSent: 0, orgsSkipped: 1 });
  expect(sendEmail).not.toHaveBeenCalled();
  expect(getOrganizationEventsCount).not.toHaveBeenCalled();
});

test('sends the no-data branch of what-to-track on day 2', async () => {
  getOrganizationEventsCount.mockResolvedValue(0);
  organizationFindMany.mockResolvedValue([
    org({
      onboarding: 'onboarding-welcome',
      createdAt: subDays(new Date(), 2),
    }),
  ]);

  await runOnboardingCron(deps, logger);

  expect(sendEmail).toHaveBeenCalledWith('onboarding-what-to-track', {
    to: 'user@example.com',
    data: expect.objectContaining({ hasData: false, eventsCount: 0 }),
  });
});

test('completes onboarding when the org subscribed before the trial emails', async () => {
  organizationFindMany.mockResolvedValue([
    org({
      onboarding: 'onboarding-feature-request',
      createdAt: subDays(new Date(), 27),
      subscriptionStatus: 'active',
    }),
  ]);

  const result = await runOnboardingCron(deps, logger);

  expect(result).toMatchObject({ emailsSent: 0, orgsCompleted: 1 });
  expect(sendEmail).not.toHaveBeenCalled();
  expect(organizationUpdate).toHaveBeenCalledWith({
    where: { id: 'org-1' },
    data: { onboarding: 'completed' },
  });
});

test('populates recommendedPlan and trial stats in the trial-ending email', async () => {
  // Regression: recommendedPlan used to read subscriptionPeriodEventsCount,
  // which is always 0 for trial orgs (no Polar billing period).
  getOrganizationEventsCount.mockResolvedValue(84_211);
  organizationFindMany.mockResolvedValue([
    org({
      onboarding: 'onboarding-feature-request',
      createdAt: subDays(new Date(), 27),
    }),
  ]);

  await runOnboardingCron(deps, logger);

  expect(sendEmail).toHaveBeenCalledWith('onboarding-trial-ending', {
    to: 'user@example.com',
    data: expect.objectContaining({
      hasData: true,
      eventsCount: 84_211,
      trialEndDate: 'June 16',
      // Compact-number casing (100K vs 100k) is ICU-version dependent and
      // differs between macOS and Linux/CI, so match case-insensitively.
      recommendedPlan: expect.stringMatching(
        /100k events per month for \$20\.00/i
      ),
    }),
  });
  // Memoized — one query even though both data and recommendedPlan use it.
  expect(getOrganizationEventsCount).toHaveBeenCalledTimes(1);
});

test('marks onboarding completed once every email has been sent', async () => {
  organizationFindMany.mockResolvedValue([
    org({
      onboarding: 'onboarding-trial-ending',
      createdAt: subDays(new Date(), 31),
    }),
  ]);

  const result = await runOnboardingCron(deps, logger);

  expect(result).toMatchObject({ emailsSent: 0, orgsCompleted: 1 });
  expect(organizationUpdate).toHaveBeenCalledWith({
    where: { id: 'org-1' },
    data: { onboarding: 'completed' },
  });
});

test('completes orgs left on the retired trial-ended pointer', async () => {
  // The day-30 'onboarding-trial-ended' step moved to the wind-down sequence.
  // Orgs still holding that pointer must finish the drip, not restart it from
  // the welcome email. Code migration 21 settles these, but the runner has to
  // be safe on its own for any that slip through.
  organizationFindMany.mockResolvedValue([
    org({
      onboarding: 'onboarding-trial-ended',
      createdAt: subDays(new Date(), 31),
    }),
  ]);

  const result = await runOnboardingCron(deps, logger);

  expect(result).toMatchObject({ emailsSent: 0, orgsCompleted: 1 });
  expect(sendEmail).not.toHaveBeenCalled();
  expect(organizationUpdate).toHaveBeenCalledWith({
    where: { id: 'org-1' },
    data: { onboarding: 'completed' },
  });
});

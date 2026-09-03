// Onboarding email cron: the sequential drip driven by the
// `organization.onboarding` pointer. Moved from
// apps/worker/src/jobs/cron.onboarding.test.ts (M6-003) — db, the
// organization module's event-count lookup, and email are mocked; asserts
// template selection, day gating, early completion on active subs, and usage
// personalization. `mock.module` is not hoisted, so the subject is imported
// inside `beforeAll` — see AGENTS.md.

import { beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { subDays } from 'date-fns';

const organizationFindMany = mock(async () => [] as unknown[]);
const organizationUpdate = mock(async () => ({}));
const dbMock = {
  organization: { findMany: organizationFindMany, update: organizationUpdate },
};
mock.module('@openpanel/db/src/prisma-client', () => ({ db: dbMock }));

const getOrganizationEventsCount = mock(async (_projectIds: string[]) => 0);
mock.module('../organization/organization.service', () => ({
  getOrganizationById: mock(async () => null),
  getOrganizationEventsCount,
  // Unused by `runOnboardingCron`, but `../auth/auth.service` (transitively
  // imported for `hashPassword`) statically imports it — a mock module must
  // supply every named export the real module's importers destructure.
  connectUserToOrganization: mock(async () => undefined),
}));

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
  process.env.SELF_HOSTED = 'false';
});

test('returns null and does nothing when self-hosted', async () => {
  process.env.SELF_HOSTED = 'true';
  const result = await runOnboardingCron(logger);
  expect(result).toBeNull();
  expect(organizationFindMany).not.toHaveBeenCalled();
});

test('sends the welcome email on day 0 with hasData from clickhouse', async () => {
  getOrganizationEventsCount.mockResolvedValue(123);
  organizationFindMany.mockResolvedValue([org()]);

  const result = await runOnboardingCron(logger);

  expect(result).toMatchObject({ emailsSent: 1 });
  expect(sendEmail).toHaveBeenCalledWith('onboarding-welcome', {
    to: 'user@example.com',
    data: expect.objectContaining({ firstName: 'Alex', hasData: true }),
  });
  expect(getOrganizationEventsCount).toHaveBeenCalledWith(['proj-1']);
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

  const result = await runOnboardingCron(logger);

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

  await runOnboardingCron(logger);

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

  const result = await runOnboardingCron(logger);

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

  await runOnboardingCron(logger);

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

  const result = await runOnboardingCron(logger);

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

  const result = await runOnboardingCron(logger);

  expect(result).toMatchObject({ emailsSent: 0, orgsCompleted: 1 });
  expect(sendEmail).not.toHaveBeenCalled();
  expect(organizationUpdate).toHaveBeenCalledWith({
    where: { id: 'org-1' },
    data: { onboarding: 'completed' },
  });
});

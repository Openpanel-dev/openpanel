// Onboarding email cron: the sequential drip driven by the `org.onboarding`
// pointer. db and email are mocked; we assert template selection, day gating,
// early completion on active subs, and usage personalization.

import { subDays } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onboardingJob } from './cron.onboarding';

const { dbMock, getOrganizationEventsCountMock, sendEmailMock } = vi.hoisted(
  () => ({
    dbMock: {
      organization: {
        findMany: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      },
    },
    getOrganizationEventsCountMock: vi.fn(),
    sendEmailMock: vi.fn().mockResolvedValue({}),
  }),
);

vi.mock('@openpanel/db', () => ({
  db: dbMock,
  getOrganizationEventsCount: getOrganizationEventsCountMock,
}));

vi.mock('@openpanel/email', () => ({
  sendEmail: sendEmailMock,
}));

const org = (overrides: Record<string, unknown> = {}) => ({
  id: 'org-1',
  name: 'Acme',
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
});

const job = {} as Parameters<typeof onboardingJob>[0];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SELF_HOSTED', 'false');
  dbMock.organization.update.mockResolvedValue({});
  sendEmailMock.mockResolvedValue({});
  getOrganizationEventsCountMock.mockResolvedValue(0);
});

describe('onboardingJob', () => {
  it('sends the welcome email on day 0 with hasData from clickhouse', async () => {
    getOrganizationEventsCountMock.mockResolvedValue(123);
    dbMock.organization.findMany.mockResolvedValue([org()]);

    const result = await onboardingJob(job);

    expect(result).toMatchObject({ emailsSent: 1 });
    expect(sendEmailMock).toHaveBeenCalledWith('onboarding-welcome', {
      to: 'user@example.com',
      data: expect.objectContaining({
        firstName: 'Alex',
        hasData: true,
      }),
    });
    expect(getOrganizationEventsCountMock).toHaveBeenCalledWith(['proj-1']);
    expect(dbMock.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { onboarding: 'onboarding-welcome' },
    });
  });

  it('does not fetch usage for orgs that are gated on days', async () => {
    dbMock.organization.findMany.mockResolvedValue([
      org({
        onboarding: 'onboarding-welcome',
        createdAt: subDays(new Date(), 1), // next email is day 2
      }),
    ]);

    const result = await onboardingJob(job);

    expect(result).toMatchObject({ emailsSent: 0, orgsSkipped: 1 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(getOrganizationEventsCountMock).not.toHaveBeenCalled();
  });

  it('sends the no-data branch of what-to-track on day 2', async () => {
    getOrganizationEventsCountMock.mockResolvedValue(0);
    dbMock.organization.findMany.mockResolvedValue([
      org({
        onboarding: 'onboarding-welcome',
        createdAt: subDays(new Date(), 2),
      }),
    ]);

    await onboardingJob(job);

    expect(sendEmailMock).toHaveBeenCalledWith('onboarding-what-to-track', {
      to: 'user@example.com',
      data: expect.objectContaining({ hasData: false, eventsCount: 0 }),
    });
  });

  it('completes onboarding when the org subscribed before the trial emails', async () => {
    dbMock.organization.findMany.mockResolvedValue([
      org({
        onboarding: 'onboarding-feature-request',
        createdAt: subDays(new Date(), 27),
        subscriptionStatus: 'active',
      }),
    ]);

    const result = await onboardingJob(job);

    expect(result).toMatchObject({ emailsSent: 0, orgsCompleted: 1 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(dbMock.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { onboarding: 'completed' },
    });
  });

  it('populates recommendedPlan and trial stats in the trial-ending email', async () => {
    // Regression: recommendedPlan used to read subscriptionPeriodEventsCount,
    // which is always 0 for trial orgs (no Polar billing period).
    getOrganizationEventsCountMock.mockResolvedValue(84_211);
    dbMock.organization.findMany.mockResolvedValue([
      org({
        onboarding: 'onboarding-feature-request',
        createdAt: subDays(new Date(), 27),
      }),
    ]);

    await onboardingJob(job);

    expect(sendEmailMock).toHaveBeenCalledWith('onboarding-trial-ending', {
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
    expect(getOrganizationEventsCountMock).toHaveBeenCalledTimes(1);
  });

  it('marks onboarding completed once every email has been sent', async () => {
    dbMock.organization.findMany.mockResolvedValue([
      org({
        onboarding: 'onboarding-trial-ended',
        createdAt: subDays(new Date(), 31),
      }),
    ]);

    const result = await onboardingJob(job);

    expect(result).toMatchObject({ emailsSent: 0, orgsCompleted: 1 });
    expect(dbMock.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { onboarding: 'completed' },
    });
  });
});

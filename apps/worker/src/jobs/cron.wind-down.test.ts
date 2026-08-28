/**
 * The db, email and pricing modules are replaced wholesale — these assert the
 * job's decisions (who enters, which step fires, what gets written), not any
 * real persistence.
 */
import { subDays } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  dbMock,
  getOrganizationEventsCountMock,
  getOrganizationEventsCountSinceMock,
  getLastEventPerProjectMock,
  sendEmailMock,
  getRecommendedPlanMock,
} = vi.hoisted(() => ({
  dbMock: {
    organization: {
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
  getOrganizationEventsCountMock: vi.fn(),
  getOrganizationEventsCountSinceMock: vi.fn(),
  getLastEventPerProjectMock: vi.fn(),
  sendEmailMock: vi.fn().mockResolvedValue({}),
  getRecommendedPlanMock: vi.fn(),
}));

vi.mock('@openpanel/db', () => ({
  db: dbMock,
  getOrganizationEventsCount: getOrganizationEventsCountMock,
  getOrganizationEventsCountSince: getOrganizationEventsCountSinceMock,
  getLastEventPerProject: getLastEventPerProjectMock,
}));
vi.mock('@openpanel/email', () => ({ sendEmail: sendEmailMock }));
vi.mock('@openpanel/payments', () => ({
  getRecommendedPlan: getRecommendedPlanMock,
}));
const { buildWinBackHighlightMock } = vi.hoisted(() => ({
  buildWinBackHighlightMock: vi.fn(),
}));
vi.mock('./lib/win-back-highlight', () => ({
  buildWinBackHighlight: buildWinBackHighlightMock,
  HIGHLIGHT_MIN_RECENT_EVENTS: 1000,
}));

import { windDownCronJob } from './cron.wind-down';

type OrgOverrides = Record<string, unknown>;

function makeOrg(overrides: OrgOverrides = {}) {
  return {
    id: 'org-1',
    subscriptionState: 'trial_expired',
    subscriptionStatus: 'trialing',
    subscriptionEndsAt: subDays(new Date(), 800),
    subscriptionId: null,
    windDownStartedAt: null,
    windDownStep: null,
    deleteAt: null,
    createdBy: {
      id: 'user-1',
      email: 'user@example.com',
      firstName: 'Alex',
      deletedAt: null,
    },
    projects: [{ id: 'project-1', name: 'acme-web' }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv('SELF_HOSTED', 'false');
  vi.stubEnv('DASHBOARD_URL', 'https://dashboard.openpanel.dev');
  dbMock.organization.update.mockResolvedValue({});
  dbMock.organization.updateMany.mockResolvedValue({ count: 0 });
  sendEmailMock.mockResolvedValue({});
  getOrganizationEventsCountMock.mockResolvedValue(1000);
  getOrganizationEventsCountSinceMock.mockResolvedValue(250);
  // Default: nothing has sent recently.
  getLastEventPerProjectMock.mockResolvedValue(new Map());
  buildWinBackHighlightMock.mockResolvedValue(undefined);
  getRecommendedPlanMock.mockReturnValue('100K events per month for $20.00');
});

describe('windDownCronJob', () => {
  it('does nothing when self hosted', async () => {
    vi.stubEnv('SELF_HOSTED', 'true');

    expect(await windDownCronJob()).toBeNull();
    expect(dbMock.organization.findMany).not.toHaveBeenCalled();
  });

  it('starts a long-expired org at step 0 rather than at deletion', async () => {
    // The anchor decision, asserted directly: this org's trial ended 800 days
    // ago. Measuring the schedule from subscriptionEndsAt would put it past
    // every step and delete it without warning.
    dbMock.organization.findMany.mockResolvedValue([makeOrg()]);

    const result = await windDownCronJob();

    expect(result).toMatchObject({ entering: 1, emailsSent: 1 });
    expect(sendEmailMock).toHaveBeenCalledWith('wind-down-expired', {
      to: 'user@example.com',
      data: expect.objectContaining({ firstName: 'Alex' }),
    });
    expect(dbMock.organization.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['org-1'] } },
      data: { windDownStartedAt: expect.any(Date) },
    });
    expect(dbMock.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { windDownStep: 'expired_notice' },
    });
    // Nothing scheduled for deletion on the way in.
    expect(dbMock.organization.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deleteAt: expect.anything() }),
      }),
    );
  });

  it('caps how many organizations enter per run', async () => {
    vi.stubEnv('WIND_DOWN_MAX_PER_RUN', '2');
    dbMock.organization.findMany.mockResolvedValue([
      makeOrg({ id: 'org-1' }),
      makeOrg({ id: 'org-2' }),
      makeOrg({ id: 'org-3' }),
      makeOrg({ id: 'org-4' }),
    ]);

    const result = await windDownCronJob();

    expect(result).toMatchObject({ entering: 2 });
    expect(dbMock.organization.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['org-1', 'org-2'] } },
      data: { windDownStartedAt: expect.any(Date) },
    });
  });

  it('blocks ingestion by advancing the pointer on day 21', async () => {
    dbMock.organization.findMany.mockResolvedValue([
      makeOrg({
        windDownStartedAt: subDays(new Date(), 21),
        windDownStep: 'stopping_soon',
      }),
    ]);

    await windDownCronJob();

    expect(sendEmailMock).toHaveBeenCalledWith(
      'wind-down-blocked',
      expect.anything(),
    );
    expect(dbMock.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { windDownStep: 'blocked' },
    });
  });

  it('arms deletion once the final warning is delivered', async () => {
    dbMock.organization.findMany.mockResolvedValue([
      makeOrg({
        windDownStartedAt: subDays(new Date(), 44),
        windDownStep: 'blocked',
      }),
    ]);

    await windDownCronJob();

    expect(sendEmailMock).toHaveBeenCalledWith(
      'wind-down-final-warning',
      expect.anything(),
    );
    expect(dbMock.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { deleteAt: expect.any(Date) },
    });
    expect(dbMock.organization.update).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { windDownStep: 'final_warning' },
    });
  });

  it('does not arm deletion when the final warning was not delivered', async () => {
    sendEmailMock.mockResolvedValue(null);
    dbMock.organization.findMany.mockResolvedValue([
      makeOrg({
        windDownStartedAt: subDays(new Date(), 44),
        windDownStep: 'blocked',
      }),
    ]);

    const result = await windDownCronJob();

    expect(result).toMatchObject({ emailsSent: 0, failed: 1 });
    expect(dbMock.organization.update).not.toHaveBeenCalled();
  });

  it('releases an organization that subscribed mid-sequence', async () => {
    dbMock.organization.findMany.mockResolvedValue([
      makeOrg({
        subscriptionState: 'active',
        subscriptionStatus: 'active',
        subscriptionId: 'sub-123',
        windDownStartedAt: subDays(new Date(), 30),
        windDownStep: 'blocked',
        deleteAt: new Date(),
      }),
    ]);

    const result = await windDownCronJob();

    expect(result).toMatchObject({ recovered: 1, emailsSent: 0 });
    expect(dbMock.organization.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['org-1'] } },
      data: { windDownStartedAt: null, windDownStep: null, deleteAt: null },
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('skips organizations with no one to warn', async () => {
    dbMock.organization.findMany.mockResolvedValue([
      makeOrg({ createdBy: null }),
      makeOrg({
        id: 'org-2',
        createdBy: {
          id: 'user-2',
          email: 'gone@example.com',
          firstName: null,
          deletedAt: new Date(),
        },
      }),
    ]);

    const result = await windDownCronJob();

    expect(result).toMatchObject({ entering: 0, emailsSent: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  describe('still-tracking organizations', () => {
    // The population this whole sequence is aimed at: trial lapsed months ago,
    // SDKs never stopped, never paid a cent.
    it('lets organizations that are still tracking into the sequence first', async () => {
      vi.stubEnv('WIND_DOWN_MAX_PER_RUN', '1');
      getLastEventPerProjectMock.mockResolvedValue(
        new Map([['project-active', subDays(new Date(), 1)]]),
      );
      // The dormant org is returned first, so only ordering can save the
      // active one from being crowded out by the long tail.
      dbMock.organization.findMany.mockResolvedValue([
        makeOrg({
          id: 'org-dormant',
          projects: [{ id: 'project-dormant', name: 'dormant-web' }],
        }),
        makeOrg({
          id: 'org-active',
          projects: [{ id: 'project-active', name: 'active-web' }],
        }),
      ]);

      const result = await windDownCronJob();

      expect(result).toMatchObject({ entering: 1, stillTracking: 1 });
      expect(dbMock.organization.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['org-active'] } },
        data: { windDownStartedAt: expect.any(Date) },
      });
    });

    it('sends current volume, project names and the data highlight', async () => {
      getLastEventPerProjectMock.mockResolvedValue(
        new Map([['project-1', subDays(new Date(), 1)]]),
      );
      getOrganizationEventsCountMock.mockResolvedValue(842_110);
      getOrganizationEventsCountSinceMock.mockResolvedValue(128_400);
      buildWinBackHighlightMock.mockResolvedValue(
        'acme-web had a strong month.',
      );
      dbMock.organization.findMany.mockResolvedValue([makeOrg()]);

      await windDownCronJob();

      expect(sendEmailMock).toHaveBeenCalledWith('wind-down-expired', {
        to: 'user@example.com',
        data: expect.objectContaining({
          stillTracking: true,
          eventsCount: 842_110,
          recentEventsCount: 128_400,
          projectNames: ['acme-web'],
          highlight: 'acme-web had a strong month.',
        }),
      });
      expect(buildWinBackHighlightMock).toHaveBeenCalledWith({
        project: { id: 'project-1', name: 'acme-web' },
        recentEventsCount: 128_400,
      });
    });

    it('asks for no highlight when the org is not still tracking', async () => {
      dbMock.organization.findMany.mockResolvedValue([makeOrg()]);

      await windDownCronJob();

      expect(buildWinBackHighlightMock).not.toHaveBeenCalled();
      expect(sendEmailMock).toHaveBeenCalledWith('wind-down-expired', {
        to: 'user@example.com',
        data: expect.objectContaining({ highlight: undefined }),
      });
    });

    it('does not call an org still tracking when its last event is old', async () => {
      getLastEventPerProjectMock.mockResolvedValue(
        new Map([['project-1', subDays(new Date(), 200)]]),
      );
      dbMock.organization.findMany.mockResolvedValue([makeOrg()]);

      const result = await windDownCronJob();

      expect(result).toMatchObject({ stillTracking: 0 });
      expect(sendEmailMock).toHaveBeenCalledWith('wind-down-expired', {
        to: 'user@example.com',
        data: expect.objectContaining({ stillTracking: false }),
      });
    });
  });
});

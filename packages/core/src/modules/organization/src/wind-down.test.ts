// Moved from apps/worker/src/jobs/cron.wind-down.test.ts (M9-003).
//
// Prisma, the event counts, the last-event lookup, the highlight builder and
// the email transport are injected stubs — these assert the job's decisions
// (who enters, which step fires, what gets written), not any real persistence.
// No `mock.module`, so nothing this file does leaks into another test file.

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { subDays } from 'date-fns';
import { testCoreConfig } from '../../../../test/config-fixture';
import type { Logger } from '../../../logger';
import {
  runWindDownCron,
  type WindDownDeps,
  type WindDownOrganization,
} from './wind-down';

function stubLogger(): Logger {
  const noop = () => undefined;
  const logger: Logger = {
    fatal: noop,
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    child: () => logger,
  };
  return logger;
}

const organizationFindMany = mock(
  async (): Promise<WindDownOrganization[]> => []
);
const organizationUpdate = mock(async (_args: unknown) => ({}));
const organizationUpdateMany = mock(async (_args: unknown) => ({ count: 0 }));
const getLastEventPerProject = mock(async () => new Map<string, Date>());
const getOrganizationEventsCount = mock(async () => 1000);
const getOrganizationEventsCountSince = mock(async () => 250);
const buildHighlight = mock(async (): Promise<string | undefined> => undefined);
const sendEmail = mock(
  async (_template: string, _options: unknown): Promise<unknown> => ({})
);

function deps(): WindDownDeps {
  return {
    db: {
      organization: {
        findMany: organizationFindMany,
        update: organizationUpdate,
        updateMany: organizationUpdateMany,
      },
    },
    logger: stubLogger(),
    config: windDownConfig(),
    sendEmail: sendEmail as WindDownDeps['sendEmail'],
    getLastEventPerProject,
    getOrganizationEventsCount,
    getOrganizationEventsCountSince,
    buildHighlight,
  };
}

function makeOrg(
  overrides: Partial<WindDownOrganization> & Record<string, unknown> = {}
): WindDownOrganization {
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
  } as WindDownOrganization;
}

/** SELF_HOSTED / DASHBOARD_URL / WIND_DOWN_MAX_PER_RUN arrive as config. */
function windDownConfig(
  overrides: { selfHosted?: boolean; maxPerRun?: number } = {}
) {
  const base = testCoreConfig();
  return testCoreConfig({
    selfHosted: overrides.selfHosted ?? false,
    dashboardUrl: 'https://dashboard.openpanel.dev',
    query: { ...base.query, windDownMaxPerRun: overrides.maxPerRun },
  });
}

beforeEach(() => {
  organizationFindMany.mockClear().mockResolvedValue([]);
  organizationUpdate.mockClear().mockResolvedValue({});
  organizationUpdateMany.mockClear().mockResolvedValue({ count: 0 });
  sendEmail.mockClear().mockResolvedValue({});
  getOrganizationEventsCount.mockClear().mockResolvedValue(1000);
  getOrganizationEventsCountSince.mockClear().mockResolvedValue(250);
  // Default: nothing has sent recently.
  getLastEventPerProject.mockClear().mockResolvedValue(new Map());
  buildHighlight.mockClear().mockResolvedValue(undefined);
});

describe('runWindDownCron', () => {
  it('does nothing when self hosted', async () => {
    expect(
      await runWindDownCron({
        ...deps(),
        config: windDownConfig({ selfHosted: true }),
      })
    ).toBeNull();
    expect(organizationFindMany).not.toHaveBeenCalled();
  });

  it('starts a long-expired org at step 0 rather than at deletion', async () => {
    // The anchor decision, asserted directly: this org's trial ended 800 days
    // ago. Measuring the schedule from subscriptionEndsAt would put it past
    // every step and delete it without warning.
    organizationFindMany.mockResolvedValue([makeOrg()]);

    const result = await runWindDownCron(deps());

    expect(result).toMatchObject({ entering: 1, emailsSent: 1 });
    expect(sendEmail).toHaveBeenCalledWith('wind-down-expired', {
      to: 'user@example.com',
      data: expect.objectContaining({ firstName: 'Alex' }),
    });
    expect(organizationUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['org-1'] } },
      data: { windDownStartedAt: expect.any(Date) },
    });
    expect(organizationUpdate).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { windDownStep: 'expired_notice' },
    });
    // Nothing scheduled for deletion on the way in.
    expect(organizationUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deleteAt: expect.anything() }),
      })
    );
  });

  it('caps how many organizations enter per run', async () => {
    organizationFindMany.mockResolvedValue([
      makeOrg({ id: 'org-1' }),
      makeOrg({ id: 'org-2' }),
      makeOrg({ id: 'org-3' }),
      makeOrg({ id: 'org-4' }),
    ]);

    const result = await runWindDownCron({
      ...deps(),
      config: windDownConfig({ maxPerRun: 2 }),
    });

    expect(result).toMatchObject({ entering: 2 });
    expect(organizationUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['org-1', 'org-2'] } },
      data: { windDownStartedAt: expect.any(Date) },
    });
  });

  it('blocks ingestion by advancing the pointer on day 21', async () => {
    organizationFindMany.mockResolvedValue([
      makeOrg({
        windDownStartedAt: subDays(new Date(), 21),
        windDownStep: 'stopping_soon',
      }),
    ]);

    await runWindDownCron(deps());

    expect(sendEmail).toHaveBeenCalledWith(
      'wind-down-blocked',
      expect.anything()
    );
    expect(organizationUpdate).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { windDownStep: 'blocked' },
    });
  });

  it('arms deletion once the final warning is delivered', async () => {
    organizationFindMany.mockResolvedValue([
      makeOrg({
        windDownStartedAt: subDays(new Date(), 44),
        windDownStep: 'blocked',
      }),
    ]);

    await runWindDownCron(deps());

    expect(sendEmail).toHaveBeenCalledWith(
      'wind-down-final-warning',
      expect.anything()
    );
    expect(organizationUpdate).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { deleteAt: expect.any(Date) },
    });
    expect(organizationUpdate).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      data: { windDownStep: 'final_warning' },
    });
  });

  it('does not arm deletion when the final warning was not delivered', async () => {
    sendEmail.mockResolvedValue(null);
    organizationFindMany.mockResolvedValue([
      makeOrg({
        windDownStartedAt: subDays(new Date(), 44),
        windDownStep: 'blocked',
      }),
    ]);

    const result = await runWindDownCron(deps());

    expect(result).toMatchObject({ emailsSent: 0, failed: 1 });
    expect(organizationUpdate).not.toHaveBeenCalled();
  });

  it('releases an organization that subscribed mid-sequence', async () => {
    organizationFindMany.mockResolvedValue([
      makeOrg({
        subscriptionState: 'active',
        subscriptionStatus: 'active',
        subscriptionId: 'sub-123',
        windDownStartedAt: subDays(new Date(), 30),
        windDownStep: 'blocked',
        deleteAt: new Date(),
      }),
    ]);

    const result = await runWindDownCron(deps());

    expect(result).toMatchObject({ recovered: 1, emailsSent: 0 });
    expect(organizationUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['org-1'] } },
      data: { windDownStartedAt: null, windDownStep: null, deleteAt: null },
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('skips organizations with no one to warn', async () => {
    organizationFindMany.mockResolvedValue([
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

    const result = await runWindDownCron(deps());

    expect(result).toMatchObject({ entering: 0, emailsSent: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  describe('still-tracking organizations', () => {
    // The population this whole sequence is aimed at: trial lapsed months ago,
    // SDKs never stopped, never paid a cent.
    it('lets organizations that are still tracking into the sequence first', async () => {
      getLastEventPerProject.mockResolvedValue(
        new Map([['project-active', subDays(new Date(), 1)]])
      );
      // The dormant org is returned first, so only ordering can save the
      // active one from being crowded out by the long tail.
      organizationFindMany.mockResolvedValue([
        makeOrg({
          id: 'org-dormant',
          projects: [{ id: 'project-dormant', name: 'dormant-web' }],
        }),
        makeOrg({
          id: 'org-active',
          projects: [{ id: 'project-active', name: 'active-web' }],
        }),
      ]);

      const result = await runWindDownCron({
        ...deps(),
        config: windDownConfig({ maxPerRun: 1 }),
      });

      expect(result).toMatchObject({ entering: 1, stillTracking: 1 });
      expect(organizationUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ['org-active'] } },
        data: { windDownStartedAt: expect.any(Date) },
      });
    });

    it('sends current volume, project names and the data highlight', async () => {
      getLastEventPerProject.mockResolvedValue(
        new Map([['project-1', subDays(new Date(), 1)]])
      );
      getOrganizationEventsCount.mockResolvedValue(842_110);
      getOrganizationEventsCountSince.mockResolvedValue(128_400);
      buildHighlight.mockResolvedValue('acme-web had a strong month.');
      organizationFindMany.mockResolvedValue([makeOrg()]);

      await runWindDownCron(deps());

      expect(sendEmail).toHaveBeenCalledWith('wind-down-expired', {
        to: 'user@example.com',
        data: expect.objectContaining({
          stillTracking: true,
          eventsCount: 842_110,
          recentEventsCount: 128_400,
          projectNames: ['acme-web'],
          highlight: 'acme-web had a strong month.',
        }),
      });
      expect(buildHighlight).toHaveBeenCalledWith({
        project: { id: 'project-1', name: 'acme-web' },
        recentEventsCount: 128_400,
      });
    });

    it('asks for no highlight when the org is not still tracking', async () => {
      organizationFindMany.mockResolvedValue([makeOrg()]);

      await runWindDownCron(deps());

      expect(buildHighlight).not.toHaveBeenCalled();
      expect(sendEmail).toHaveBeenCalledWith('wind-down-expired', {
        to: 'user@example.com',
        data: expect.objectContaining({ highlight: undefined }),
      });
    });

    it('does not call an org still tracking when its last event is old', async () => {
      getLastEventPerProject.mockResolvedValue(
        new Map([['project-1', subDays(new Date(), 200)]])
      );
      organizationFindMany.mockResolvedValue([makeOrg()]);

      const result = await runWindDownCron(deps());

      expect(result).toMatchObject({ stillTracking: 0 });
      expect(sendEmail).toHaveBeenCalledWith('wind-down-expired', {
        to: 'user@example.com',
        data: expect.objectContaining({ stillTracking: false }),
      });
    });
  });
});

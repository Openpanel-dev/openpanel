import { beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { testCoreConfig } from '../../../test/config-fixture';
import { recordingLogger } from '../../../test/service-deps';
import type { ServiceDeps } from '../../services';

interface TimezoneOrganization {
  id: string;
  timezone: string | null;
  subscriptionChartEndDate: Date | null;
}

interface TimezoneProject {
  id: string;
  organizationId: string;
  deleteAt: Date | null;
}

const organizationStore = new Map<string, TimezoneOrganization>();
const projectStore = new Map<string, TimezoneProject>();

function makeOrganization(
  overrides: Partial<TimezoneOrganization> & { id: string }
): TimezoneOrganization {
  return { timezone: null, subscriptionChartEndDate: null, ...overrides };
}

const organization = {
  findUniqueOrThrow: mock(
    async ({ where: { id } }: { where: { id: string } }) => {
      const found = organizationStore.get(id);
      if (!found) {
        throw new Error(`organization ${id} not found`);
      }
      return found;
    }
  ),
};

const project = {
  findUniqueOrThrow: mock(
    async ({ where: { id } }: { where: { id: string } }) => {
      const found = projectStore.get(id);
      if (!found) {
        throw new Error(`project ${id} not found`);
      }
      return {
        ...found,
        organization: organizationStore.get(found.organizationId) ?? null,
      };
    }
  ),
};

const deps = {
  db: { organization, project },
  config: testCoreConfig(),
  logger: recordingLogger(),
} as unknown as ServiceDeps;

// Keep the real per-deps/per-DB wrappers, but bypass Redis for these unit tests.
mock.module('@openpanel/redis', () => ({
  cacheable: (_name: string, fn: (...args: unknown[]) => unknown) =>
    Object.assign(fn, {
      getKey: () => '',
      clear: async () => 0,
      set: () => async () => 'OK' as const,
    }),
}));

mock.module('../../clients/email', () => ({
  sendEmail: () => {
    throw new Error('Timezone tests must not send email');
  },
}));

let subject: typeof import('./organization.service');
beforeAll(async () => {
  subject = await import('./organization.service');
});

beforeEach(() => {
  organizationStore.clear();
  projectStore.clear();
});

for (const [timezone, expected] of [
  [null, 'Asia/Riyadh'],
  ['', 'Asia/Riyadh'],
  ['America/New_York', 'America/New_York'],
  ['Not/AZone', 'UTC'],
] as const) {
  test(`organization and project timezone priority for ${JSON.stringify(timezone)}`, async () => {
    const warning = mock(() => undefined);
    const scopedDeps = {
      ...deps,
      config: testCoreConfig({ defaultTimezone: 'Asia/Riyadh' }),
      logger: { ...deps.logger, warn: warning },
    };
    organizationStore.set('org_1', makeOrganization({ id: 'org_1', timezone }));
    projectStore.set('proj_1', {
      id: 'proj_1',
      organizationId: 'org_1',
      deleteAt: null,
    });
    expect(
      await subject.getSettingsForOrganization(scopedDeps, 'org_1')
    ).toEqual({ timezone: expected });
    expect(await subject.getSettingsForProject(scopedDeps, 'proj_1')).toEqual({
      timezone: expected,
    });
    expect(warning).toHaveBeenCalledTimes(timezone === 'Not/AZone' ? 2 : 0);
    expect(organizationStore.get('org_1')?.timezone).toBe(timezone);
  });
}

test('timezone defaults stay isolated between dependency configurations', async () => {
  organizationStore.set(
    'org_1',
    makeOrganization({
      id: 'org_1',
      subscriptionChartEndDate: new Date('2026-01-31T21:30:00.000Z'),
    })
  );
  projectStore.set('proj_1', {
    id: 'proj_1',
    organizationId: 'org_1',
    deleteAt: null,
  });
  const riyadh = {
    ...deps,
    config: testCoreConfig({ defaultTimezone: 'Asia/Riyadh' }),
  };
  for (const current of [riyadh, deps, riyadh]) {
    expect(await subject.getSettingsForOrganization(current, 'org_1')).toEqual({
      timezone: current.config.defaultTimezone,
    });
    expect(await subject.getSettingsForProject(current, 'proj_1')).toEqual({
      timezone: current.config.defaultTimezone,
    });
    expect(
      await subject.getOrganizationSubscriptionChartEndDate(
        current,
        'proj_1',
        '2026-02-02 00:00:00'
      )
    ).toBe(
      current.config.defaultTimezone === 'Asia/Riyadh'
        ? '2026-02-01 00:30:00'
        : '2026-01-31 21:30:00'
    );
  }
});

for (const [timezone, expected] of [
  [null, '2026-02-01 00:30:00'],
  ['', '2026-02-01 00:30:00'],
  ['America/New_York', '2026-01-31 16:30:00'],
  ['Not/AZone', '2026-01-31 21:30:00'],
] as const) {
  test(`subscription cutoff uses the resolved timezone for ${JSON.stringify(timezone)}`, async () => {
    organizationStore.set(
      'org_1',
      makeOrganization({
        id: 'org_1',
        timezone,
        subscriptionChartEndDate: new Date('2026-01-31T21:30:00.000Z'),
      })
    );
    projectStore.set('proj_1', {
      id: 'proj_1',
      organizationId: 'org_1',
      deleteAt: null,
    });
    const scopedDeps = {
      ...deps,
      config: testCoreConfig({ defaultTimezone: 'Asia/Riyadh' }),
    };
    expect(
      await subject.getOrganizationSubscriptionChartEndDate(
        scopedDeps,
        'proj_1',
        '2026-02-02 00:00:00'
      )
    ).toBe(expected);
    expect(
      await subject.getOrganizationSubscriptionChartEndDate(
        scopedDeps,
        'proj_1',
        '2026-01-30 00:00:00'
      )
    ).toBe('2026-01-30 00:00:00');
  });
}

test('subscription cutoff keeps the requested end when no cutoff is set', async () => {
  organizationStore.set('org_1', makeOrganization({ id: 'org_1' }));
  projectStore.set('proj_1', {
    id: 'proj_1',
    organizationId: 'org_1',
    deleteAt: null,
  });
  expect(
    await subject.getOrganizationSubscriptionChartEndDate(
      deps,
      'proj_1',
      '2026-02-02 00:00:00'
    )
  ).toBe('2026-02-02 00:00:00');
});

test('subscription cutoff stays null when the project has no organization', async () => {
  projectStore.set('proj_1', {
    id: 'proj_1',
    organizationId: 'missing',
    deleteAt: null,
  });
  expect(
    await subject.getOrganizationSubscriptionChartEndDate(
      deps,
      'proj_1',
      '2026-02-02 00:00:00'
    )
  ).toBeNull();
});

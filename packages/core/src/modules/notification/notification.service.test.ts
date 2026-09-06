// notification.service.ts's db access is lazy (`await import(...)` inside
// each function — see the file's header), which is exactly what makes
// `mock.module` work here with no import-time side effects to race: every
// mock below is registered before the subject's first call, not before its
// (side-effect-free) import.

import { afterAll, beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import type { IChartEvent } from '@openpanel/validation';

interface FakeRule {
  id: string;
  name: string;
  projectId: string;
  sendToApp: boolean;
  sendToEmail: boolean;
  config: { type: 'events' | 'funnel'; events: IChartEvent[] };
  template: string | null;
  integrations: { id: string }[];
}

const ruleStore = new Map<string, FakeRule>();
const integrationStore = new Map<
  string,
  {
    id: string;
    projectId: string | null;
    organizationId: string;
    config: unknown;
  }
>();

function makeRule(overrides: Partial<FakeRule> & { id: string }): FakeRule {
  return {
    name: 'Rule',
    projectId: 'proj_1',
    sendToApp: false,
    sendToEmail: false,
    config: { type: 'events', events: [] },
    template: null,
    integrations: [],
    ...overrides,
  };
}

const publishedEvents: unknown[] = [];
// M10-009: spread a plain-object SNAPSHOT of the real module and restore it in
// afterAll — `mock.module` has no per-file scope under bare `bun test`
// (AGENTS.md), and a partial factory deletes `getRedisCache` and friends for
// every file that runs next.
const realRedis = { ...(await import('@openpanel/redis')) };
mock.module('@openpanel/redis', () => ({
  ...realRedis,
  cacheable: (
    _name: string,
    fn: (...args: unknown[]) => unknown,
    _ttl: number
  ) => fn,
  publishEvent: (channel: string, type: string, event: unknown) => {
    publishedEvents.push({ channel, type, event });
  },
}));

const realPrismaClient = {
  ...(await import('@openpanel/db/src/prisma-client')),
};

afterAll(async () => {
  mock.module('@openpanel/redis', () => realRedis);
  mock.module('@openpanel/db/src/prisma-client', () => realPrismaClient);
  // Restoring the module registry is not enough: `v1-compat.ts` MEMOIZES the
  // fallback `ServiceDeps` the first time anything resolves it, so if that
  // happened while the mock above was installed, every later FILE in this
  // process keeps the mocked client (bare `bun test` shares one registry).
  // Drop the memo too — same reason mcp's dashboard-management.test.ts does.
  const { resetV1CompatServicesForTests } = await import('../../v1-compat');
  resetV1CompatServicesForTests();
});

const notificationRule = {
  findMany: mock(async ({ where }: { where: { projectId: string } }) =>
    [...ruleStore.values()].filter((r) => r.projectId === where.projectId)
  ),
  findUniqueOrThrow: mock(
    async ({ where: { id } }: { where: { id: string } }) => {
      const found = ruleStore.get(id);
      if (!found) {
        throw new Error(`rule ${id} not found`);
      }
      return found;
    }
  ),
  create: mock(async ({ data }: { data: Partial<FakeRule> }) => {
    const row = makeRule({
      id: `rule_${ruleStore.size + 1}`,
      ...data,
    } as never);
    ruleStore.set(row.id, row);
    return row;
  }),
  update: mock(
    async ({
      where: { id },
      data,
    }: {
      where: { id: string };
      data: Partial<FakeRule>;
    }) => {
      const existing = ruleStore.get(id);
      if (!existing) {
        throw new Error(`rule ${id} not found`);
      }
      const next = { ...existing, ...data };
      ruleStore.set(id, next as FakeRule);
      return next;
    }
  ),
  delete: mock(async ({ where: { id } }: { where: { id: string } }) => {
    const existing = ruleStore.get(id);
    ruleStore.delete(id);
    return existing;
  }),
};

const integration = {
  findMany: mock(async ({ where }: { where: { id: { in: string[] } } }) =>
    [...integrationStore.values()].filter((i) => where.id.in.includes(i.id))
  ),
};

const project = {
  findUniqueOrThrow: mock(async () => ({ organizationId: 'org_1' })),
};

// M10-009: every function under test takes `ServiceDeps`, so `deps.db` IS the
// fake below. The `@openpanel/db/src/prisma-client` mock stays only for the
// cacheable `getNotificationRulesByProjectId`, which reaches Postgres through
// the v1-compat seam (see the service's header) — and for `Prisma.JsonNull` /
// `Prisma.DbNull`, which `compatPrisma()` reads from the same module.
const actualPrismaClient = await import('@openpanel/db/src/prisma-client');
mock.module('@openpanel/db/src/prisma-client', () => ({
  ...actualPrismaClient,
  db: { notificationRule, integration, project },
}));

const deps = {
  db: { notificationRule, integration, project },
} as unknown as import('../../services').ServiceDeps;

let subject: typeof import('./notification.service');
beforeAll(async () => {
  subject = await import('./notification.service');
});

beforeEach(() => {
  ruleStore.clear();
  integrationStore.clear();
  publishedEvents.length = 0;
  notificationRule.create.mockClear();
  notificationRule.update.mockClear();
});

const CLICK_EVENT = { name: 'click', filters: [] } as never;

test('isBaseIntegration finds app and email, nothing else', () => {
  expect(subject.isBaseIntegration('app')).toBeTruthy();
  expect(subject.isBaseIntegration('email')).toBeTruthy();
  expect(subject.isBaseIntegration('slack_1')).toBeUndefined();
});

test('matchEvent matches by exact name', () => {
  const payload = { name: 'click' } as never;
  expect(subject.matchEvent(payload, CLICK_EVENT)).toBe(true);
  expect(subject.matchEvent({ name: 'purchase' } as never, CLICK_EVENT)).toBe(
    false
  );
});

test('matchEvent matches any event name on a wildcard', () => {
  const wildcard = { name: '*', filters: [] } as never;
  expect(subject.matchEvent({ name: 'anything' } as never, wildcard)).toBe(
    true
  );
});

test('matchEventFilters: an empty value list always matches', () => {
  expect(
    subject.matchEventFilters({} as never, [
      { name: 'country', operator: 'is', value: [] } as never,
    ])
  ).toBe(true);
});

test('matchEventFilters: "is" matches the exact property value', () => {
  const payload = { country: 'SE' } as never;
  expect(
    subject.matchEventFilters(payload, [
      { name: 'country', operator: 'is', value: ['SE'] } as never,
    ])
  ).toBe(true);
  expect(
    subject.matchEventFilters(payload, [
      { name: 'country', operator: 'is', value: ['US'] } as never,
    ])
  ).toBe(false);
});

test('matchEventFilters: has_profile compares profileId against deviceId', () => {
  const identified = { profileId: 'p1', deviceId: 'd1' } as never;
  const anonymous = { profileId: 'd1', deviceId: 'd1' } as never;
  const filter = {
    name: 'has_profile',
    operator: 'is',
    value: ['true'],
  } as never;
  expect(subject.matchEventFilters(identified, [filter])).toBe(true);
  expect(subject.matchEventFilters(anonymous, [filter])).toBe(false);
});

test('getHasFunnelRules / getFunnelRules split on config.type', () => {
  const rules = [
    makeRule({ id: 'r1', config: { type: 'events', events: [] } }),
    makeRule({ id: 'r2', config: { type: 'funnel', events: [] } }),
  ] as never;
  expect(subject.getHasFunnelRules(rules)).toBe(true);
  expect(subject.getFunnelRules(rules)).toHaveLength(1);
  expect(subject.getHasFunnelRules([makeRule({ id: 'r3' })] as never)).toBe(
    false
  );
});

test('notificationTemplateEvent falls back to a default when no template is set', () => {
  const rule = makeRule({ id: 'r1', template: null });
  const result = subject.notificationTemplateEvent({
    payload: { name: 'click' } as never,
    rule: rule as never,
  });
  expect(result).toBe('You received a new "click" event');
});

test('notificationTemplateEvent substitutes $EVENT_NAME, $RULE_NAME and {{path}} placeholders', () => {
  const rule = makeRule({
    id: 'r1',
    name: 'My Rule',
    template: '$RULE_NAME saw $EVENT_NAME from {{properties.country}}',
  });
  const result = subject.notificationTemplateEvent({
    payload: { name: 'click', properties: { country: 'SE' } } as never,
    rule: rule as never,
  });
  expect(result).toBe('My Rule saw click from SE');
});

test('notificationTemplateFunnel joins matched event names with an arrow', () => {
  const rule = makeRule({ id: 'r1', template: null });
  const result = subject.notificationTemplateFunnel({
    events: [{ name: 'view' }, { name: 'checkout' }] as never,
    rule: rule as never,
  });
  expect(result).toBe('Funnel "Rule" completed');
});

test('listNotificationRules merges the app/email pseudo-integrations onto real ones', async () => {
  ruleStore.set(
    'rule_1',
    makeRule({
      id: 'rule_1',
      sendToApp: true,
      sendToEmail: false,
      integrations: [{ id: 'slack_1' }],
    })
  );

  const result = await subject.listNotificationRules(deps, 'proj_1');

  expect(result).toHaveLength(1);
  expect(result[0]?.integrations.map((i) => i.id)).toEqual(['app', 'slack_1']);
});

test('createOrUpdateNotificationRule rejects an integration from another project', async () => {
  integrationStore.set('slack_1', {
    id: 'slack_1',
    projectId: 'proj_other',
    organizationId: 'org_1',
    config: { type: 'slack' },
  });

  await expect(
    subject.createOrUpdateNotificationRule(deps, {
      name: 'Rule',
      config: { type: 'events', events: [] },
      integrations: ['slack_1'],
      sendToApp: false,
      sendToEmail: false,
      projectId: 'proj_1',
    })
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('createOrUpdateNotificationRule rejects an export-only integration', async () => {
  integrationStore.set('s3_1', {
    id: 's3_1',
    projectId: 'proj_1',
    organizationId: 'org_1',
    config: { type: 's3_export' },
  });

  await expect(
    subject.createOrUpdateNotificationRule(deps, {
      name: 'Rule',
      config: { type: 'events', events: [] },
      integrations: ['s3_1'],
      sendToApp: false,
      sendToEmail: false,
      projectId: 'proj_1',
    })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

test('createOrUpdateNotificationRule creates a new rule when id is absent', async () => {
  const created = await subject.createOrUpdateNotificationRule(deps, {
    name: 'Rule',
    config: { type: 'events', events: [] },
    integrations: ['app'],
    sendToApp: true,
    sendToEmail: false,
    projectId: 'proj_1',
  });

  expect(created).toMatchObject({ name: 'Rule', sendToApp: true });
  expect(notificationRule.create).toHaveBeenCalledTimes(1);
});

test('deleteNotificationRule removes the row', async () => {
  ruleStore.set('rule_1', makeRule({ id: 'rule_1' }));
  await subject.deleteNotificationRule(deps, 'rule_1');
  expect(ruleStore.has('rule_1')).toBe(false);
});

test('deliverNotification publishes the app pseudo-integration instead of enqueuing an email or plugin', async () => {
  await subject.deliverNotification(deps, {
    projectId: 'proj_1',
    title: 'Hello',
    message: 'World',
    sendToApp: true,
  } as never);

  expect(publishedEvents).toEqual([
    {
      channel: 'notification',
      type: 'created',
      event: {
        projectId: 'proj_1',
        title: 'Hello',
        message: 'World',
        sendToApp: true,
      },
    },
  ]);
});

import { afterAll, beforeAll, beforeEach, expect, mock, test } from 'bun:test';
import { testCoreConfig } from '../../../test/config-fixture';
import { recordingLogger } from '../../../test/service-deps';

interface FakeOrganization {
  id: string;
  name: string;
  timezone: string | null;
  createdByUserId: string | null;
  deleteAt: Date | null;
  subscriptionStatus: string | null;
  subscriptionCurrentPeriodStart: Date | null;
  subscriptionCurrentPeriodEnd: Date | null;
  subscriptionEndsAt: Date | null;
  subscriptionChartEndDate: Date | null;
  createdAt: Date;
  // Prisma `$extends` computed fields, set directly on the fixture.
  hasSubscription: boolean;
  isWillBeCanceled: boolean;
}

interface FakeProject {
  id: string;
  organizationId: string;
  deleteAt: Date | null;
}

interface FakeMember {
  id: string;
  organizationId: string;
  userId: string | null;
  role: string;
  email: string;
}

interface FakeInvite {
  id: string;
  email: string;
  organizationId: string;
  role: string;
  createdById: string;
  projectAccess: { projectId: string; level: 'read' | 'write' }[];
  expiresAt: Date;
  createdAt: Date;
}

interface FakeUser {
  id: string;
  email: string;
}

const EPOCH = new Date('2026-09-03T00:00:00.000Z');

function makeOrganization(
  overrides: Partial<FakeOrganization> & { id: string }
): FakeOrganization {
  return {
    name: 'Acme',
    timezone: null,
    createdByUserId: null,
    deleteAt: null,
    subscriptionStatus: null,
    subscriptionCurrentPeriodStart: null,
    subscriptionCurrentPeriodEnd: null,
    subscriptionEndsAt: null,
    subscriptionChartEndDate: null,
    createdAt: EPOCH,
    hasSubscription: false,
    isWillBeCanceled: false,
    ...overrides,
  };
}

const organizationStore = new Map<string, FakeOrganization>();
const projectStore = new Map<string, FakeProject>();
const memberStore = new Map<string, FakeMember>();
const inviteStore = new Map<string, FakeInvite>();
const userStore = new Map<string, FakeUser>();
const projectAccessStore = new Map<
  string,
  {
    id: string;
    userId: string;
    organizationId: string;
    projectId: string;
    level: string;
  }
>();

function resetStores() {
  organizationStore.clear();
  projectStore.clear();
  memberStore.clear();
  inviteStore.clear();
  userStore.clear();
  projectAccessStore.clear();
}

const organization = {
  findMany: mock(
    async ({
      where,
    }: {
      where?: {
        members?: { some: { userId: string } };
        OR?: unknown[];
        deleteAt?: { lte: Date };
      };
    } = {}) => {
      let rows = [...organizationStore.values()];
      if (where?.members) {
        const userId = where.members.some.userId;
        rows = rows.filter((org) =>
          [...memberStore.values()].some(
            (m) => m.organizationId === org.id && m.userId === userId
          )
        );
      }
      if (where?.OR) {
        rows = rows.filter((org) => {
          const scheduledForDeletion =
            org.deleteAt && org.deleteAt <= new Date();
          const noAdmin = ![...memberStore.values()].some(
            (m) => m.organizationId === org.id && m.role === 'org:admin'
          );
          return scheduledForDeletion || noAdmin;
        });
      }
      return rows.map((org) => ({
        ...org,
        projects: [...projectStore.values()].filter(
          (p) => p.organizationId === org.id
        ),
      }));
    }
  ),
  findUniqueOrThrow: mock(
    async ({ where: { id } }: { where: { id: string } }) => {
      const org = organizationStore.get(id);
      if (!org) {
        throw new Error(`organization ${id} not found`);
      }
      return org;
    }
  ),
  update: mock(
    async ({
      where: { id },
      data,
    }: {
      where: { id: string };
      data: Partial<FakeOrganization>;
    }) => {
      const existing = organizationStore.get(id);
      if (!existing) {
        throw new Error(`organization ${id} not found`);
      }
      const next = { ...existing, ...data };
      organizationStore.set(id, next);
      return next;
    }
  ),
  delete: mock(async ({ where: { id } }: { where: { id: string } }) => {
    organizationStore.delete(id);
  }),
};

const project = {
  findMany: mock(
    async ({
      where,
    }: {
      where?: {
        id?: { in: string[] };
        deleteAt?: { lte: Date };
        organizationId?: string;
      };
    } = {}) => {
      let rows = [...projectStore.values()];
      if (where?.id) {
        rows = rows.filter((p) => where.id?.in.includes(p.id));
      }
      if (where?.organizationId) {
        rows = rows.filter((p) => p.organizationId === where.organizationId);
      }
      if (where?.deleteAt) {
        rows = rows.filter((p) => p.deleteAt && p.deleteAt <= new Date());
      }
      return rows;
    }
  ),
  deleteMany: mock(
    async ({ where: { id } }: { where: { id: { in: string[] } } }) => {
      let count = 0;
      for (const projectId of id.in) {
        if (projectStore.delete(projectId)) {
          count++;
        }
      }
      return { count };
    }
  ),
  updateMany: mock(
    async ({
      where: { organizationId },
      data,
    }: {
      where: { organizationId: string };
      data: Partial<FakeProject>;
    }) => {
      let count = 0;
      for (const p of projectStore.values()) {
        if (p.organizationId === organizationId) {
          Object.assign(p, data);
          count++;
        }
      }
      return { count };
    }
  ),
};

const member = {
  count: mock(
    async ({ where }: { where: { userId: string; organizationId: string } }) =>
      [...memberStore.values()].filter(
        (m) =>
          m.userId === where.userId && m.organizationId === where.organizationId
      ).length
  ),
  findFirst: mock(
    async ({ where }: { where: { userId?: string; organizationId: string } }) =>
      [...memberStore.values()].find(
        (m) =>
          m.organizationId === where.organizationId &&
          (where.userId === undefined || m.userId === where.userId)
      ) ?? null
  ),
  findMany: mock(
    async ({
      where,
    }: {
      where: { organizationId: string; userId?: unknown };
    }) =>
      [...memberStore.values()]
        .filter((m) => m.organizationId === where.organizationId && m.userId)
        .map((m) => ({ ...m, user: userStore.get(m.userId as string) }))
  ),
  delete: mock(
    async ({
      where,
    }: {
      where: { id: string; userId: string; organizationId: string };
    }) => {
      const existing = memberStore.get(where.id);
      if (!existing || existing.userId !== where.userId) {
        throw new Error('member not found');
      }
      memberStore.delete(where.id);
      return existing;
    }
  ),
  upsert: mock(
    async ({
      where,
      update,
      create,
    }: {
      where: {
        organizationId_userId: { organizationId: string; userId: string };
      };
      update: Partial<FakeMember>;
      create: Omit<FakeMember, 'id'>;
    }) => {
      const existing = [...memberStore.values()].find(
        (m) =>
          m.organizationId === where.organizationId_userId.organizationId &&
          m.userId === where.organizationId_userId.userId
      );
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const id = `member_${memberStore.size + 1}`;
      const row = { id, ...create };
      memberStore.set(id, row);
      return row;
    }
  ),
};

const invite = {
  findFirst: mock(
    async ({ where }: { where: { email: string; organizationId: string } }) =>
      [...inviteStore.values()].find(
        (i) =>
          i.email === where.email && i.organizationId === where.organizationId
      ) ?? null
  ),
  findMany: mock(async ({ where }: { where: { organizationId: string } }) =>
    [...inviteStore.values()]
      .filter((i) => i.organizationId === where.organizationId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  ),
  findUnique: mock(async ({ where: { id } }: { where: { id: string } }) => {
    const found = inviteStore.get(id);
    if (!found) {
      return null;
    }
    return {
      ...found,
      organization: { id: found.organizationId, name: 'Acme' },
    };
  }),
  findUniqueOrThrow: mock(
    async ({ where: { id } }: { where: { id: string } }) => {
      const found = inviteStore.get(id);
      if (!found) {
        throw new Error(`invite ${id} not found`);
      }
      return found;
    }
  ),
  create: mock(async ({ data }: { data: FakeInvite }) => {
    inviteStore.set(data.id, { ...data, createdAt: EPOCH });
    return { ...data, organization: { name: 'Acme' } };
  }),
  delete: mock(async ({ where: { id } }: { where: { id: string } }) => {
    const found = inviteStore.get(id);
    inviteStore.delete(id);
    return found;
  }),
};

const user = {
  findFirst: mock(
    async ({ where }: { where: { email: { equals: string } } }) =>
      [...userStore.values()].find((u) => u.email === where.email.equals) ??
      null
  ),
};

const projectAccess = {
  findMany: mock(async ({ where }: { where: { organizationId: string } }) =>
    [...projectAccessStore.values()].filter(
      (a) => a.organizationId === where.organizationId
    )
  ),
  create: mock(
    async ({
      data,
    }: {
      data: {
        projectId: string;
        userId: string;
        organizationId: string;
        level: string;
      };
    }) => {
      const id = `access_${projectAccessStore.size + 1}`;
      const row = { id, ...data };
      projectAccessStore.set(id, row);
      return row;
    }
  ),
  createMany: mock(
    async ({
      data,
    }: {
      data: {
        projectId: string;
        userId: string;
        organizationId: string;
        level: string;
      }[];
    }) => {
      for (const grant of data) {
        const id = `access_${projectAccessStore.size + 1}`;
        projectAccessStore.set(id, { id, ...grant });
      }
      return { count: data.length };
    }
  ),
  deleteMany: mock(
    async ({
      where,
    }: {
      where: { userId: string; organizationId: string };
    }) => {
      let count = 0;
      for (const [id, row] of projectAccessStore.entries()) {
        if (
          row.userId === where.userId &&
          row.organizationId === where.organizationId
        ) {
          projectAccessStore.delete(id);
          count++;
        }
      }
      return { count };
    }
  ),
};

const $transaction = mock(async (ops: Promise<unknown>[]) => Promise.all(ops));

// `connectUserToOrganization` reaches `shared/access-lookups.ts` (cacheable, on
// the unscoped db), which is why the `@openpanel/redis` stand-in below stays.
const chCommand = mock(async () => undefined);
const deps = {
  logger: recordingLogger(),
  db: {
    organization,
    project,
    member,
    invite,
    user,
    projectAccess,
    $transaction,
  },
  ch: { command: chCommand },
  config: testCoreConfig(),
} as unknown as import('../../services').ServiceDeps;

// Bypasses the Redis cache-aside. The access lookups call `.clear()` on their
// cacheable-wrapped functions, so the stand-in needs that method too. Real
// `cacheable` overloads on `(fn, ttl)` or `(name, fn, ttl)`; both are used.
const clearedCacheKeys: string[] = [];
function cacheableStub(
  fnOrName: ((...args: unknown[]) => unknown) | string,
  fnOrTtl: ((...args: unknown[]) => unknown) | number
) {
  const fn =
    typeof fnOrName === 'function'
      ? fnOrName
      : (fnOrTtl as (...args: unknown[]) => unknown);
  const name = typeof fnOrName === 'string' ? fnOrName : fnOrName.name;
  return Object.assign(fn, {
    getKey: () => '',
    clear: async (...args: unknown[]) => {
      clearedCacheKeys.push(`${name}:${JSON.stringify(args[0])}`);
      return 0;
    },
    set: () => async () => 'OK' as const,
  });
}

function seedMemberWithTwoProjects() {
  memberStore.set('member_1', {
    id: 'member_1',
    organizationId: 'org_1',
    userId: 'user_1',
    role: 'org:member',
    email: 'a@example.com',
  });
  for (const id of ['proj_1', 'proj_2']) {
    projectStore.set(id, { id, organizationId: 'org_1', deleteAt: null });
  }
}

const EXPECTED_CLEARED_ACCESS_KEYS = [
  'getOrganizationAccess:{"userId":"user_1","organizationId":"org_1"}',
  'getProjectAccessV2:{"userId":"user_1","projectId":"proj_1"}',
  'getProjectAccessV2:{"userId":"user_1","projectId":"proj_2"}',
];
// Spread the real module: `mock.module` replaces this specifier process-wide,
// and `event-buffer.ts` value-imports `publishEvent` from here, so a partial
// factory turns this file's own barrel import into a SyntaxError.
const realRedis = { ...(await import('@openpanel/redis')) };
mock.module('@openpanel/redis', () => ({
  ...realRedis,
  cacheable: cacheableStub,
  getRedisCache: () => ({
    get: async () => null,
    setex: async () => undefined,
    del: async () => undefined,
  }),
}));

afterAll(() => {
  mock.module('@openpanel/redis', () => realRedis);
});

// Mocks core's `clients/email.ts` wrapper, not @openpanel/email: that package
// statically imports @openpanel/db's full barrel, an eager side-effecting chain.
const sentEmails: { templateKey: string; to: string; data: unknown }[] = [];
mock.module('../../clients/email', () => ({
  sendEmail: async (
    templateKey: string,
    options: { to: string; data: unknown }
  ) => {
    sentEmails.push({ templateKey, to: options.to, data: options.data });
  },
}));

let subject: typeof import('./organization.service');
beforeAll(async () => {
  subject = await import('./organization.service');
});

beforeEach(() => {
  resetStores();
  sentEmails.length = 0;
  clearedCacheKeys.length = 0;
});

test('scheduleOrganizationDeletion sets deleteAt on the org and its projects', async () => {
  organizationStore.set('org_1', makeOrganization({ id: 'org_1' }));
  projectStore.set('proj_1', {
    id: 'proj_1',
    organizationId: 'org_1',
    deleteAt: null,
  });

  await subject.scheduleOrganizationDeletion(deps, 'org_1');

  expect(organizationStore.get('org_1')?.deleteAt).toBeInstanceOf(Date);
  expect(projectStore.get('proj_1')?.deleteAt).toBeInstanceOf(Date);
});

test('scheduleOrganizationDeletion refuses a live, uncancelled subscription', async () => {
  organizationStore.set(
    'org_1',
    makeOrganization({
      id: 'org_1',
      hasSubscription: true,
      isWillBeCanceled: false,
    })
  );

  await expect(
    subject.scheduleOrganizationDeletion(deps, 'org_1')
  ).rejects.toThrow(/cancel your subscription/);
});

test('scheduleOrganizationDeletion allows a subscription already scheduled to cancel', async () => {
  organizationStore.set(
    'org_1',
    makeOrganization({
      id: 'org_1',
      hasSubscription: true,
      isWillBeCanceled: true,
    })
  );

  await subject.scheduleOrganizationDeletion(deps, 'org_1');
  expect(organizationStore.get('org_1')?.deleteAt).toBeInstanceOf(Date);
});

test('cancelOrganizationDeletion clears deleteAt on the org and its projects', async () => {
  organizationStore.set(
    'org_1',
    makeOrganization({ id: 'org_1', deleteAt: new Date() })
  );
  projectStore.set('proj_1', {
    id: 'proj_1',
    organizationId: 'org_1',
    deleteAt: new Date(),
  });

  await subject.cancelOrganizationDeletion(deps, 'org_1');

  expect(organizationStore.get('org_1')?.deleteAt).toBeNull();
  expect(projectStore.get('proj_1')?.deleteAt).toBeNull();
});

test('updateOrganization updates name and timezone', async () => {
  organizationStore.set('org_1', makeOrganization({ id: 'org_1' }));
  const result = await subject.updateOrganization(deps, {
    id: 'org_1',
    name: 'New name',
    timezone: 'Europe/Stockholm',
  });
  expect(result).toMatchObject({
    name: 'New name',
    timezone: 'Europe/Stockholm',
  });
});

test('removeOrganizationMember refuses a user removing themself as the last member', async () => {
  memberStore.set('member_1', {
    id: 'member_1',
    organizationId: 'org_1',
    userId: 'user_1',
    role: 'org:admin',
    email: 'a@example.com',
  });

  await expect(
    subject.removeOrganizationMember(deps, {
      organizationId: 'org_1',
      memberId: 'member_1',
      targetUserId: 'user_1',
      requestedByUserId: 'user_1',
    })
  ).rejects.toThrow(/cannot remove yourself/);
  expect(memberStore.has('member_1')).toBe(true);
});

test('removeOrganizationMember deletes the member and their project access', async () => {
  memberStore.set('member_1', {
    id: 'member_1',
    organizationId: 'org_1',
    userId: 'user_1',
    role: 'org:member',
    email: 'a@example.com',
  });
  projectAccessStore.set('access_1', {
    id: 'access_1',
    userId: 'user_1',
    organizationId: 'org_1',
    projectId: 'proj_1',
    level: 'write',
  });

  await subject.removeOrganizationMember(deps, {
    organizationId: 'org_1',
    memberId: 'member_1',
    targetUserId: 'user_1',
    requestedByUserId: 'user_admin',
  });

  expect(memberStore.has('member_1')).toBe(false);
  expect(projectAccessStore.has('access_1')).toBe(false);
});

// The lookups cache a granted answer for minutes; without these clears a
// removed or restricted member kept their access until the entry expired.
test('removeOrganizationMember drops the cached access for every project of the organization', async () => {
  seedMemberWithTwoProjects();

  await subject.removeOrganizationMember(deps, {
    organizationId: 'org_1',
    memberId: 'member_1',
    targetUserId: 'user_1',
    requestedByUserId: 'user_admin',
  });

  expect(clearedCacheKeys.sort()).toEqual(EXPECTED_CLEARED_ACCESS_KEYS);
});

test('updateOrganizationMemberAccess drops the cached access for every project of the organization', async () => {
  seedMemberWithTwoProjects();

  await subject.updateOrganizationMemberAccess(deps, {
    organizationId: 'org_1',
    targetUserId: 'user_1',
    access: [{ projectId: 'proj_1', level: 'read' }],
  });

  expect(clearedCacheKeys.sort()).toEqual(EXPECTED_CLEARED_ACCESS_KEYS);
});

test('connectUserToOrganization drops the cached access for every project of the organization', async () => {
  seedMemberWithTwoProjects();
  memberStore.clear();
  inviteStore.set('invite_1', {
    id: 'invite_1',
    email: 'a@example.com',
    organizationId: 'org_1',
    role: 'org:member',
    createdById: 'user_admin',
    projectAccess: [{ projectId: 'proj_1', level: 'read' }],
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: EPOCH,
  });

  await subject.connectUserToOrganization(deps, {
    user: { id: 'user_1', email: 'a@example.com' } as never,
    inviteId: 'invite_1',
  });

  expect(clearedCacheKeys.sort()).toEqual(EXPECTED_CLEARED_ACCESS_KEYS);
});

test('updateOrganizationMemberAccess replaces project access with the given grants', async () => {
  memberStore.set('member_1', {
    id: 'member_1',
    organizationId: 'org_1',
    userId: 'user_1',
    role: 'org:member',
    email: 'a@example.com',
  });
  projectStore.set('proj_new', {
    id: 'proj_new',
    organizationId: 'org_1',
    deleteAt: null,
  });
  projectAccessStore.set('access_old', {
    id: 'access_old',
    userId: 'user_1',
    organizationId: 'org_1',
    projectId: 'proj_old',
    level: 'read',
  });

  await subject.updateOrganizationMemberAccess(deps, {
    organizationId: 'org_1',
    targetUserId: 'user_1',
    access: [{ projectId: 'proj_new', level: 'write' }],
  });

  const remaining = [...projectAccessStore.values()];
  expect(remaining).toHaveLength(1);
  expect(remaining[0]).toMatchObject({ projectId: 'proj_new', level: 'write' });
});

// Guards: access rows must not be written for a user never confirmed as a
// member, or for a project outside the organization the grant is scoped to.
test('updateOrganizationMemberAccess refuses a user who is not a member', async () => {
  projectStore.set('proj_new', {
    id: 'proj_new',
    organizationId: 'org_1',
    deleteAt: null,
  });

  await expect(
    subject.updateOrganizationMemberAccess(deps, {
      organizationId: 'org_1',
      targetUserId: 'not_a_member',
      access: [{ projectId: 'proj_new', level: 'write' }],
    })
  ).rejects.toThrow(/not a member/i);

  expect([...projectAccessStore.values()]).toHaveLength(0);
});

test('updateOrganizationMemberAccess refuses a project from another organization', async () => {
  memberStore.set('member_1', {
    id: 'member_1',
    organizationId: 'org_1',
    userId: 'user_1',
    role: 'org:member',
    email: 'a@example.com',
  });
  projectStore.set('proj_elsewhere', {
    id: 'proj_elsewhere',
    organizationId: 'org_2',
    deleteAt: null,
  });

  await expect(
    subject.updateOrganizationMemberAccess(deps, {
      organizationId: 'org_1',
      targetUserId: 'user_1',
      access: [{ projectId: 'proj_elsewhere', level: 'write' }],
    })
  ).rejects.toThrow(/not in this organization/i);

  expect([...projectAccessStore.values()]).toHaveLength(0);
});

test('inviteUserToOrganization refuses when the email is already a member', async () => {
  userStore.set('user_1', { id: 'user_1', email: 'a@example.com' });
  memberStore.set('member_1', {
    id: 'member_1',
    organizationId: 'org_1',
    userId: 'user_1',
    role: 'org:member',
    email: 'a@example.com',
  });

  await expect(
    subject.inviteUserToOrganization(deps, {
      organizationId: 'org_1',
      email: 'a@example.com',
      role: 'org:member',
      access: [],
      invitedById: 'user_admin',
    })
  ).rejects.toThrow(/already a member/);
});

test('inviteUserToOrganization refuses a duplicate pending invite', async () => {
  inviteStore.set('invite_1', {
    id: 'invite_1',
    email: 'b@example.com',
    organizationId: 'org_1',
    role: 'org:member',
    createdById: 'user_admin',
    projectAccess: [],
    expiresAt: new Date(Date.now() + 1000),
    createdAt: EPOCH,
  });

  await expect(
    subject.inviteUserToOrganization(deps, {
      organizationId: 'org_1',
      email: 'b@example.com',
      role: 'org:member',
      access: [],
      invitedById: 'user_admin',
    })
  ).rejects.toThrow(/already invited/);
});

test('inviteUserToOrganization connects an existing user immediately, with no email sent', async () => {
  userStore.set('user_2', { id: 'user_2', email: 'c@example.com' });

  const result = await subject.inviteUserToOrganization(deps, {
    organizationId: 'org_1',
    email: 'c@example.com',
    role: 'org:member',
    access: [],
    invitedById: 'user_admin',
  });

  expect(result.type).toBe('is_member');
  expect(sentEmails).toHaveLength(0);
});

test('inviteUserToOrganization emails a new user and leaves the invite pending', async () => {
  const result = await subject.inviteUserToOrganization(deps, {
    organizationId: 'org_1',
    email: 'new@example.com',
    role: 'org:member',
    access: [],
    invitedById: 'user_admin',
  });

  expect(result.type).toBe('is_invited');
  expect(sentEmails).toHaveLength(1);
  expect(sentEmails[0]).toMatchObject({
    templateKey: 'invite',
    to: 'new@example.com',
  });
});

test('revokeInvite deletes the invite row', async () => {
  inviteStore.set('invite_1', {
    id: 'invite_1',
    email: 'b@example.com',
    organizationId: 'org_1',
    role: 'org:member',
    createdById: 'user_admin',
    projectAccess: [],
    expiresAt: new Date(Date.now() + 1000),
    createdAt: EPOCH,
  });

  await subject.revokeInvite(deps, 'invite_1');
  expect(inviteStore.has('invite_1')).toBe(false);
});

test('runDeleteCron sweeps orphaned and scheduled-for-deletion organizations and projects', async () => {
  organizationStore.set(
    'org_orphaned',
    makeOrganization({ id: 'org_orphaned' })
  );
  organizationStore.set(
    'org_paying',
    makeOrganization({
      id: 'org_paying',
      hasSubscription: true,
      isWillBeCanceled: false,
    })
  );
  memberStore.set('member_paying_admin', {
    id: 'member_paying_admin',
    organizationId: 'org_paying',
    userId: 'user_1',
    role: 'org:admin',
    email: 'a@example.com',
  });
  projectStore.set('proj_orphaned', {
    id: 'proj_orphaned',
    organizationId: 'org_orphaned',
    deleteAt: null,
  });
  projectStore.set('proj_scheduled', {
    id: 'proj_scheduled',
    organizationId: 'org_paying',
    deleteAt: new Date(Date.now() - 1000),
  });

  const result = await subject.runDeleteCron(deps);

  expect(result).toEqual({ organizations: 1, projects: 2 });
  expect(organizationStore.has('org_orphaned')).toBe(false);
  expect(organizationStore.has('org_paying')).toBe(true);
  expect(projectStore.has('proj_orphaned')).toBe(false);
  expect(projectStore.has('proj_scheduled')).toBe(false);
  expect(chCommand).toHaveBeenCalled();
});

test('runDeleteCron is a no-op when nothing is due', async () => {
  organizationStore.set('org_healthy', makeOrganization({ id: 'org_healthy' }));
  memberStore.set('member_1', {
    id: 'member_1',
    organizationId: 'org_healthy',
    userId: 'user_1',
    role: 'org:admin',
    email: 'a@example.com',
  });

  const result = await subject.runDeleteCron(deps);
  expect(result).toEqual({ organizations: 0, projects: 0 });
  expect(organizationStore.has('org_healthy')).toBe(true);
});

test('getSettingsForOrganization falls back to UTC when the stored timezone is unknown', async () => {
  organizationStore.set(
    'org_1',
    makeOrganization({ id: 'org_1', timezone: 'Not/AZone' })
  );
  const result = await subject.getSettingsForOrganization(deps, 'org_1');
  expect(result).toEqual({ timezone: 'UTC' });
});

test('getSettingsForOrganization falls back to UTC when the organization has no timezone', async () => {
  organizationStore.set(
    'org_1',
    makeOrganization({ id: 'org_1', timezone: null })
  );
  const result = await subject.getSettingsForOrganization(deps, 'org_1');
  expect(result).toEqual({ timezone: 'UTC' });
});

// The subject is built by its factory over a fake `ServiceDeps` (M10-004), so
// Postgres needs no module mock at all — `deps.db` IS the fake below, same
// idiom as reference.service.test.ts.

import { beforeEach, expect, mock, test } from 'bun:test';
import type { ServiceDeps } from '../../services';
import { createUserService } from './user.service';

interface FakeUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface FakeOrganization {
  id: string;
  name: string;
  createdByUserId: string | null;
  hasSubscription: boolean;
  isWillBeCanceled: boolean;
}

const userStore = new Map<string, FakeUser>();
const organizationStore = new Map<string, FakeOrganization>();

function makeUser(overrides: Partial<FakeUser> & { id: string }): FakeUser {
  return {
    email: 'a@example.com',
    firstName: null,
    lastName: null,
    ...overrides,
  };
}

const user = {
  findUniqueOrThrow: mock(
    async ({ where: { id } }: { where: { id: string } }) => {
      const found = userStore.get(id);
      if (!found) {
        throw new Error(`user ${id} not found`);
      }
      return found;
    }
  ),
  findFirst: mock(
    async ({
      where,
      include,
    }: {
      where: { email: { equals: string } };
      include?: { accounts?: { where: { provider: string } } };
    }) => {
      const found = [...userStore.values()].find(
        (u) => u.email === where.email.equals
      );
      if (!found) {
        return null;
      }
      return include?.accounts ? { ...found, accounts: [] } : found;
    }
  ),
  update: mock(
    async ({
      where: { id },
      data,
    }: {
      where: { id: string };
      data: Partial<FakeUser>;
    }) => {
      const existing = userStore.get(id);
      if (!existing) {
        throw new Error(`user ${id} not found`);
      }
      const next = { ...existing, ...data };
      userStore.set(id, next);
      return next;
    }
  ),
  delete: mock(async ({ where: { id } }: { where: { id: string } }) => {
    userStore.delete(id);
  }),
};

const organization = {
  findMany: mock(async ({ where }: { where: { createdByUserId: string } }) =>
    [...organizationStore.values()].filter(
      (o) => o.createdByUserId === where.createdByUserId
    )
  ),
};

const subject = createUserService({
  db: { user, organization },
} as unknown as ServiceDeps);

beforeEach(() => {
  userStore.clear();
  organizationStore.clear();
});

test('getUserById returns the row', async () => {
  userStore.set('user_1', makeUser({ id: 'user_1' }));
  const result = await subject.getUserById('user_1');
  expect(result).toMatchObject({ id: 'user_1' });
});

test('getUserAccount returns null when the matching provider account is missing', async () => {
  userStore.set('user_1', makeUser({ id: 'user_1' }));
  const result = await subject.getUserAccount({
    email: 'a@example.com',
    provider: 'google',
  });
  expect(result).toBeNull();
});

test('updateUserProfile updates first and last name', async () => {
  userStore.set('user_1', makeUser({ id: 'user_1' }));
  const result = await subject.updateUserProfile({
    userId: 'user_1',
    firstName: 'Ralph',
    lastName: 'Wiggum',
  });
  expect(result).toMatchObject({ firstName: 'Ralph', lastName: 'Wiggum' });
});

test('listUserDeletionBlockers only returns orgs with a live, uncancelled subscription', async () => {
  organizationStore.set('org_paying', {
    id: 'org_paying',
    name: 'Paying Co',
    createdByUserId: 'user_1',
    hasSubscription: true,
    isWillBeCanceled: false,
  });
  organizationStore.set('org_canceling', {
    id: 'org_canceling',
    name: 'Canceling Co',
    createdByUserId: 'user_1',
    hasSubscription: true,
    isWillBeCanceled: true,
  });
  organizationStore.set('org_free', {
    id: 'org_free',
    name: 'Free Co',
    createdByUserId: 'user_1',
    hasSubscription: false,
    isWillBeCanceled: false,
  });

  const blockers = await subject.listUserDeletionBlockers('user_1');
  expect(blockers).toEqual([{ id: 'org_paying', name: 'Paying Co' }]);
});

test('deleteUserAccount refuses while a blocking subscription exists', async () => {
  userStore.set('user_1', makeUser({ id: 'user_1' }));
  organizationStore.set('org_paying', {
    id: 'org_paying',
    name: 'Paying Co',
    createdByUserId: 'user_1',
    hasSubscription: true,
    isWillBeCanceled: false,
  });

  await expect(subject.deleteUserAccount('user_1')).rejects.toThrow(
    /Paying Co/
  );
  expect(userStore.has('user_1')).toBe(true);
});

test('deleteUserAccount deletes the row once no blocker remains', async () => {
  userStore.set('user_1', makeUser({ id: 'user_1' }));

  await subject.deleteUserAccount('user_1');
  expect(userStore.has('user_1')).toBe(false);
});

// Moved from packages/db/src/services/user.service.ts (M6-001). packages/db
// keeps a re-export shim — packages/trpc's auth/onboarding routers (not yet
// ported) still reach `getUserById`/`getUserAccount`/`IServiceUser` through
// @openpanel/db's barrel, same shape as packages/db/src/gsc.ts since M5-002.
//
// M10-004: every function takes `ServiceDeps` and reaches Postgres as
// `deps.db`; the `loadDb()` lazy loader is gone. `onboarding.service.ts`'s
// own `getUserById` call and `packages/trpc`'s bare calls have no `deps` to
// hand it, so they reach these through v1-compat.ts's bare re-exports
// instead (see v1-compat.ts's header) — `auth.service.ts` calls
// `getUserAccount` directly since it already carries `deps` itself.

import type { User } from '@openpanel/db/src/prisma-client';
import { TRPCBadRequestError } from '../../rpc/errors';
import type { ServiceDeps } from '../../services';

export type IServiceUser = Awaited<ReturnType<typeof getUserById>>;

// Explicit `Promise<User>` return type, not inferred: Prisma's
// `findUniqueOrThrow` returns a chainable "fluent" client (PromiseLike, plus
// relation-loading methods), which trips up `Services['user']['getUserById']`
// in v1-compat.ts — a `.then(...)` wrapping a bare fluent type there can't
// unify with the plain `Promise<User>` the interface declares.
export function getUserById(deps: ServiceDeps, id: string): Promise<User> {
  return deps.db.user.findUniqueOrThrow({
    where: {
      id,
    },
  });
}

export async function getUserAccount(
  deps: ServiceDeps,
  {
    email,
    provider,
    providerId,
  }: {
    email: string;
    provider: string;
    providerId?: string;
  }
) {
  const res = await deps.db.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: 'insensitive',
      },
    },
    include: {
      accounts: {
        where: {
          provider,
          providerId: providerId ? String(providerId) : undefined,
        },
        take: 1,
      },
    },
  });

  if (!res?.accounts[0]) {
    return null;
  }

  return {
    ...res,
    account: res?.accounts[0],
  };
}

export interface UserDeletionBlocker {
  id: string;
  name: string;
}

/**
 * Organizations the user created that still have a blocking subscription
 * (active and not scheduled to cancel). The account cannot be deleted while
 * any of these exist.
 */
export async function listUserDeletionBlockers(
  deps: ServiceDeps,
  userId: string
): Promise<UserDeletionBlocker[]> {
  const organizations = await deps.db.organization.findMany({
    where: { createdByUserId: userId },
  });
  return organizations
    .filter(
      (organization) =>
        organization.hasSubscription && !organization.isWillBeCanceled
    )
    .map((organization) => ({
      id: organization.id,
      name: organization.name,
    }));
}

/**
 * Hard delete the user. Cascades clean up sessions, accounts, totp,
 * twoFactorChallenges, members, projectAccess, invites and conversations.
 * Organizations the user created have `createdByUserId`/`subscriptionCreatedByUserId`
 * set to null (SetNull); any org left without an org:admin member is then
 * removed by the organization module's `delete` cron.
 */
export async function deleteUserAccount(
  deps: ServiceDeps,
  userId: string
): Promise<void> {
  const blockers = await listUserDeletionBlockers(deps, userId);

  if (blockers.length > 0) {
    throw new TRPCBadRequestError(
      `Please cancel the subscription for ${blockers
        .map((blocker) => blocker.name)
        .join(', ')} before deleting your account.`
    );
  }

  await deps.db.user.delete({ where: { id: userId } });
}

export async function updateUserProfile(
  deps: ServiceDeps,
  input: {
    userId: string;
    firstName: string;
    lastName: string;
  }
) {
  return deps.db.user.update({
    where: {
      id: input.userId,
    },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
    },
  });
}

export interface UserService {
  getUserById(id: string): ReturnType<typeof getUserById>;
  getUserAccount(
    args: Parameters<typeof getUserAccount>[1]
  ): ReturnType<typeof getUserAccount>;
  listUserDeletionBlockers(userId: string): Promise<UserDeletionBlocker[]>;
  deleteUserAccount(userId: string): Promise<void>;
  updateUserProfile(
    input: Parameters<typeof updateUserProfile>[1]
  ): ReturnType<typeof updateUserProfile>;
}

export function createUserService(deps: ServiceDeps): UserService {
  return {
    getUserById: (id) => getUserById(deps, id),
    getUserAccount: (args) => getUserAccount(deps, args),
    listUserDeletionBlockers: (userId) =>
      listUserDeletionBlockers(deps, userId),
    deleteUserAccount: (userId) => deleteUserAccount(deps, userId),
    updateUserProfile: (input) => updateUserProfile(deps, input),
  };
}

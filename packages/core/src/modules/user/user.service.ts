// Moved from packages/db/src/services/user.service.ts (M6-001). packages/db
// keeps a re-export shim — packages/trpc's auth/onboarding routers (not yet
// ported) still reach `getUserById`/`getUserAccount`/`IServiceUser` through
// @openpanel/db's barrel, same shape as packages/db/src/gsc.ts since M5-002.
//
// db access is LAZY, not a static top-level import — see insight.service.ts's
// header for the full reasoning (jobs.registry.ts and services.ts pull this
// module into the eager barrel chain nearly every core test file reaches, and
// constructing @openpanel/db's clients at import time would spawn a
// pino-pretty transport worker thread per test file).
//
// No `UserService` / `createUserService` here: this module has no queue or
// cron of its own (module map: user is R,S only), so there is nothing that
// needs a Ctx-bound container — same shape as conversation.service.ts.

import { TRPCBadRequestError } from '../../rpc/errors';

export type IServiceUser = Awaited<ReturnType<typeof getUserById>>;

function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

export async function getUserById(id: string) {
  const db = await loadDb();
  return db.user.findUniqueOrThrow({
    where: {
      id,
    },
  });
}

export async function getUserAccount({
  email,
  provider,
  providerId,
}: {
  email: string;
  provider: string;
  providerId?: string;
}) {
  const db = await loadDb();
  const res = await db.user.findFirst({
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
  userId: string
): Promise<UserDeletionBlocker[]> {
  const db = await loadDb();
  const organizations = await db.organization.findMany({
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
export async function deleteUserAccount(userId: string): Promise<void> {
  const blockers = await listUserDeletionBlockers(userId);

  if (blockers.length > 0) {
    throw new TRPCBadRequestError(
      `Please cancel the subscription for ${blockers
        .map((blocker) => blocker.name)
        .join(', ')} before deleting your account.`
    );
  }

  const db = await loadDb();
  await db.user.delete({ where: { id: userId } });
}

export async function updateUserProfile(input: {
  userId: string;
  firstName: string;
  lastName: string;
}) {
  const db = await loadDb();
  return db.user.update({
    where: {
      id: input.userId,
    },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
    },
  });
}

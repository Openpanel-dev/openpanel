// db access is LAZY (`loadDb` below), not a static top-level import — see
// insight.service.ts's header for the full reasoning (jobs.registry.ts and
// services.ts pull this module into the eager barrel chain nearly every core
// test file reaches, and constructing @openpanel/db's clients at import time
// would spawn a pino-pretty transport worker thread per test file).
function loadDb() {
  return import('@openpanel/db/src/prisma-client').then((m) => m.db);
}

/**
 * Whether a *new* user may be created right now.
 *
 * This must only be consulted at the point where we know the account does not
 * exist yet. Calling it before an identity is known (e.g. when kicking off an
 * OAuth redirect) would reject returning users too, since we cannot tell a
 * sign-in from a sign-up at that stage.
 */
export async function getIsRegistrationAllowed(inviteId?: string | null) {
  // ALLOW_REGISTRATION is always undefined in cloud
  if (process.env.ALLOW_REGISTRATION === undefined) {
    return true;
  }

  const db = await loadDb();
  // Self-hosting logic
  // 1. First user is always allowed
  const count = await db.user.count();
  if (count === 0) {
    return true;
  }

  // 2. If there is an invite, check if it is valid
  if (inviteId) {
    if (process.env.ALLOW_INVITATION === 'false') {
      return false;
    }

    const invite = await db.invite.findUnique({
      where: {
        id: inviteId,
      },
    });

    return !!invite;
  }

  // 3. Otherwise, check if general registration is allowed
  return process.env.ALLOW_REGISTRATION !== 'false';
}

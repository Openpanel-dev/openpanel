import type { ServiceDeps } from '../../../services';

type RegistrationDeps = Pick<ServiceDeps, 'db' | 'config'>;

/**
 * Whether a *new* user may be created right now.
 *
 * This must only be consulted at the point where we know the account does not
 * exist yet. Calling it before an identity is known (e.g. when kicking off an
 * OAuth redirect) would reject returning users too, since we cannot tell a
 * sign-in from a sign-up at that stage.
 */
export async function getIsRegistrationAllowed(
  deps: RegistrationDeps,
  inviteId?: string | null
) {
  const { allowRegistration, allowInvitation } = deps.config.auth;
  if (allowRegistration === undefined) {
    return true;
  }

  // 1. First user is always allowed
  const count = await deps.db.user.count();
  if (count === 0) {
    return true;
  }

  // 2. If there is an invite, check if it is valid
  if (inviteId) {
    if (allowInvitation === false) {
      return false;
    }

    const invite = await deps.db.invite.findUnique({
      where: {
        id: inviteId,
      },
    });

    return !!invite;
  }

  return allowRegistration;
}

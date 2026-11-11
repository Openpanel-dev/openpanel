import type { ServiceDeps } from '../../../services';

type RegistrationDeps = Pick<ServiceDeps, 'db' | 'config'>;

const NUL = '\0';

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
  inviteId?: string | null,
  email?: string | null
) {
  const { allowRegistration, allowInvitation, allowRegistrationDomains } =
    deps.config.auth;
  if (
    allowRegistration === undefined &&
    allowRegistrationDomains.length === 0
  ) {
    return true;
  }

  // 1. First user is always allowed
  const anyUser = await deps.db.user.findFirst({ select: { id: true } });
  if (!anyUser) {
    return true;
  }

  // 2. If there is an invite, it must exist and be unexpired. An invite is an
  // explicit admin decision, so it is not subject to the domain list.
  if (inviteId) {
    if (allowInvitation === false) {
      return false;
    }

    // Postgres text cannot hold NUL: no invite matches, and the lookup would throw.
    if (inviteId.includes(NUL)) {
      return false;
    }

    const invite = await deps.db.invite.findUnique({
      where: {
        id: inviteId,
      },
    });

    return !!invite && invite.expiresAt >= new Date();
  }

  if (allowRegistration === false) {
    return false;
  }

  // 3. Open registration, optionally narrowed to a set of email domains
  return (
    allowRegistrationDomains.length === 0 ||
    isEmailDomainAllowed(email, allowRegistrationDomains)
  );
}

/** Exact, case-insensitive match: `acme.com` does not admit `eu.acme.com`. */
function isEmailDomainAllowed(
  email: string | null | undefined,
  domains: string[]
) {
  const at = email?.lastIndexOf('@') ?? -1;
  if (!email || at === -1) {
    return false;
  }
  return domains.includes(
    email
      .slice(at + 1)
      .trim()
      .toLowerCase()
  );
}

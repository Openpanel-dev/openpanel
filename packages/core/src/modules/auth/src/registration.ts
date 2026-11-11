import type { ServiceDeps } from '../../../services';

type RegistrationDeps = Pick<ServiceDeps, 'db' | 'config'>;

const NUL = '\0';

/**
 * `exempt` is the first user or a valid invite: allowed whatever the email.
 * `open` is ordinary self-registration, which the domain list may narrow.
 */
type Admission = 'denied' | 'exempt' | 'open';

/** Applies every registration rule that does not depend on the email. */
async function getAdmission(
  deps: RegistrationDeps,
  inviteId?: string | null
): Promise<Admission> {
  const { allowRegistration, allowInvitation, allowRegistrationDomains } =
    deps.config.auth;
  if (
    allowRegistration === undefined &&
    allowRegistrationDomains.length === 0
  ) {
    return 'open';
  }

  // 1. First user is always allowed
  const anyUser = await deps.db.user.findFirst({ select: { id: true } });
  if (!anyUser) {
    return 'exempt';
  }

  // 2. If there is an invite, it must exist and be unexpired. An invite is an
  // explicit admin decision, so it is not subject to the domain list.
  if (inviteId) {
    if (allowInvitation === false) {
      return 'denied';
    }

    // Postgres text cannot hold NUL: no invite matches, and the lookup would throw.
    if (inviteId.includes(NUL)) {
      return 'denied';
    }

    const invite = await deps.db.invite.findUnique({
      where: {
        id: inviteId,
      },
    });

    return !!invite && invite.expiresAt >= new Date() ? 'exempt' : 'denied';
  }

  return allowRegistration === false ? 'denied' : 'open';
}

/**
 * Whether sign-up should be offered to this visitor. No email is known yet, so
 * ALLOW_REGISTRATION_DOMAINS is not applied here; `getIsUserCreationAllowed`
 * enforces it once there is one.
 */
export async function getIsRegistrationAllowed(
  deps: RegistrationDeps,
  inviteId?: string | null
) {
  return (await getAdmission(deps, inviteId)) !== 'denied';
}

/**
 * Whether a *new* user with this email may be created right now.
 *
 * This must only be consulted at the point where we know the account does not
 * exist yet. Calling it before an identity is known (e.g. when kicking off an
 * OAuth redirect) would reject returning users too, since we cannot tell a
 * sign-in from a sign-up at that stage.
 */
export async function getIsUserCreationAllowed(
  deps: RegistrationDeps,
  inviteId: string | null | undefined,
  email: string | null | undefined
) {
  const admission = await getAdmission(deps, inviteId);
  if (admission !== 'open') {
    return admission === 'exempt';
  }

  const { allowRegistrationDomains } = deps.config.auth;
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

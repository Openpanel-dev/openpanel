/**
 * Why a pending invite could not be consumed, set by the OAuth callback or a
 * sign-in mutation and carried into whichever page the user lands on next.
 *
 * Deliberately destination-neutral: this renders on the onboarding form, the
 * multi-org landing page, and an existing org's dashboard, and only the first
 * of those has a "create your own workspace" action or actually left the user
 * without any organization to show.
 */
const INVITE_ERROR_MESSAGES: Record<string, string> = {
  expired: 'Your invitation has expired, so it could not be applied.',
  not_found: 'That invitation could not be found, so it could not be applied.',
  not_allowed:
    'Invitations are disabled on this instance, so it could not be applied.',
};

export function inviteErrorMessage(
  code: string | undefined | null
): string | null {
  if (!code) {
    return null;
  }
  // `code` comes from a URL query param, so it can be any string an attacker
  // chooses -- including an inherited Object.prototype member name like
  // 'toString'. A plain index would return that function instead of falling
  // back, and React would then render it as the error message.
  if (Object.hasOwn(INVITE_ERROR_MESSAGES, code)) {
    return INVITE_ERROR_MESSAGES[code];
  }
  return 'We could not apply your invitation.';
}

/**
 * Onboarding-only suffix: the one destination that actually offers "ask an
 * admin" / "create your own" as next steps, since its create-workspace form
 * is right below the message.
 */
export function onboardingInviteErrorMessage(
  code: string | undefined | null
): string | null {
  const base = inviteErrorMessage(code);
  if (!base) {
    return null;
  }
  return `${base} Ask an admin to send a new one, or continue below to create your own.`;
}

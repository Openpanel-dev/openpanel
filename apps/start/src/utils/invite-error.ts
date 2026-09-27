/**
 * Why a pending invite could not be consumed, set by the OAuth callback or a
 * sign-in mutation and carried into whichever page the user lands on next.
 */
const INVITE_ERROR_MESSAGES: Record<string, string> = {
  expired:
    'Your invitation has expired, so you have not been added to that organization. Ask an admin to send a new one, or continue below to create your own.',
  not_found:
    'That invitation could not be found, so you have not been added to any organization. Ask an admin to send a new one, or continue below to create your own.',
  not_allowed:
    'Invitations are disabled on this instance, so you have not been added to that organization. Continue below to create your own.',
};

export function inviteErrorMessage(
  code: string | undefined | null
): string | null {
  if (!code) {
    return null;
  }
  return (
    INVITE_ERROR_MESSAGES[code] ??
    'We could not apply your invitation, so you have not been added to that organization. Ask an admin to send a new one, or continue below to create your own.'
  );
}

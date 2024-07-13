import type { IServiceProfile } from '@openpanel/db';

export function getProfileName(
  profile: IServiceProfile | undefined | null,
  short = true
) {
  if (!profile) {
    return '';
  }

  if (!profile.isExternal) {
    if (short) {
      return profile.id.slice(0, 4) + '...' + profile.id.slice(-4);
    }
    return profile.id;
  }

  return (
    [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
    profile.email ||
    profile.id
  );
}

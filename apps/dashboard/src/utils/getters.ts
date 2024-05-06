import type { IServiceProfile } from '@openpanel/db';

export function getProfileName(profile: IServiceProfile | undefined | null) {
  if (!profile) return 'Unknown';

  if (!profile.isExternal) {
    return profile.id;
  }

  return (
    [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
    profile.email ||
    profile.id
  );
}

import type { IServiceProfile } from '@openpanel/db';

export function getProfileName(profile: IServiceProfile | undefined | null) {
  if (!profile) return 'No name';
  return [profile.firstName, profile.lastName].filter(Boolean).join(' ');
}

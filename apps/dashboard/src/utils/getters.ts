import type { IServiceProfile } from '@openpanel/db';

export function getProfileName(profile: IServiceProfile | undefined | null) {
  if (!profile) return 'No profile';
  return [profile.first_name, profile.last_name].filter(Boolean).join(' ');
}

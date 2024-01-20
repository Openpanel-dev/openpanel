import type { Profile } from '@mixan/db';

export function getProfileName(profile: Profile | undefined | null) {
  if (!profile) return 'No profile';
  return [profile.first_name, profile.last_name].filter(Boolean).join(' ');
}

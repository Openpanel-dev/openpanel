import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { ProfileProperties } from '@/components/profiles/profile-properties';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { cn } from '@/utils/cn';
import { getProfileName } from '@/utils/getters';
import type { IServiceProfile } from '@openpanel/db';

type Props = {
  profile: IServiceProfile | null;
  profileId: string;
};

/**
 * Mixpanel-style left profile pane: identity header + the Profile/Properties
 * card. Renders entirely from the already-fetched `profile.byId` data — no
 * extra queries.
 */
export function ProfilePane({ profile, profileId }: Props) {
  const p = profile?.properties ?? {};
  const chips = [
    p.country && {
      name: p.country,
      label: p.city ? `${p.country} / ${p.city}` : p.country,
    },
    p.device && { name: p.device, label: p.device, capitalize: true },
    p.os && { name: p.os, label: p.os },
    p.browser && { name: p.browser, label: p.browser },
    p.model && { name: p.model, label: p.model },
  ].filter(Boolean) as { name: string; label: string; capitalize?: boolean }[];

  return (
    <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
      <div className="card col gap-3 p-4 lg:shrink-0">
        <div className="row min-w-0 items-center gap-3">
          <ProfileAvatar size="lg" {...(profile ?? { id: profileId })} />
          <div className="min-w-0">
            <div className="truncate font-medium">
              {profile ? getProfileName(profile, false) : 'Anonymous'}
            </div>
            <span
              className={cn(
                'mt-1 inline-block rounded-full px-2 py-0.5 text-xs',
                profile?.isExternal
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {profile?.isExternal ? 'Identified' : 'Anonymous'}
            </span>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="row flex-wrap gap-x-4 gap-y-2 text-sm">
            {chips.map((chip) => (
              <div
                key={chip.label}
                className="row min-w-0 items-center gap-1.5"
              >
                <SerieIcon name={chip.name} />
                <span
                  className={cn('truncate', chip.capitalize && 'capitalize')}
                >
                  {chip.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <ProfileProperties profile={profile} profileId={profileId} />
    </div>
  );
}

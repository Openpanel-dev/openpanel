import { useSuspenseQuery } from '@tanstack/react-query';
import {
  Monitor,
  Smartphone,
  Server,
  HelpCircle,
} from 'lucide-react';
import { useTRPC } from '@/integrations/trpc/react';
import { Widget } from '@/components/widget';
import { WidgetHead } from '@/components/overview/overview-widget';
import { timeAgoShort } from '@/utils/date';

type Props = {
  profileId: string;
  projectId: string;
};

const PLATFORM_COLORS: Record<string, string> = {
  Web: 'bg-sky-500',
  iOS: 'bg-slate-900',
  Android: 'bg-emerald-500',
  'React Native': 'bg-indigo-500',
  Server: 'bg-amber-500',
  Unknown: 'bg-muted-foreground',
};

function PlatformIcon({ label }: { label: string }) {
  const className = 'size-4 shrink-0 text-muted-foreground';
  if (label === 'Web') return <Monitor className={className} />;
  if (label === 'iOS' || label === 'Android' || label === 'React Native')
    return <Smartphone className={className} />;
  if (label === 'Server') return <Server className={className} />;
  return <HelpCircle className={className} />;
}

/**
 * "Platforms" card — shows whether this profile uses the web, the app,
 * or both, ranked by session count. Surfaces the most recent app
 * version + build number when the SDK reports them, so support /
 * product can tell whether a user is on an old client.
 */
export function ProfilePlatforms({ profileId, projectId }: Props) {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(
    trpc.profile.platforms.queryOptions({ profileId, projectId }),
  );

  if (!data.length) {
    return null;
  }

  const totalSessions = data.reduce((acc, p) => acc + p.sessions, 0) || 1;

  return (
    <Widget className="w-full">
      <WidgetHead>
        <div className="title">Platforms</div>
      </WidgetHead>

      <div className="p-4">
        {/* Stacked bar showing the session share per platform */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          {data.map((p) => {
            const pct = (p.sessions / totalSessions) * 100;
            return (
              <div
                key={`bar-${p.label}`}
                className={PLATFORM_COLORS[p.label] ?? 'bg-muted-foreground'}
                style={{ width: `${pct}%` }}
                title={`${p.label}: ${p.sessions} sessions`}
              />
            );
          })}
        </div>

        <ul className="mt-3 flex flex-col divide-y">
          {data.map((p) => {
            const pct = Math.round((p.sessions / totalSessions) * 100);
            return (
              <li
                key={p.label}
                className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {/* Color dot matches the segment in the bar chart
                   * above so the row doubles as a legend entry. */}
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${
                      PLATFORM_COLORS[p.label] ?? 'bg-muted-foreground'
                    }`}
                  />
                  <PlatformIcon label={p.label} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {pct}%
                      </span>
                    </div>
                    {p.appVersion ? (
                      <div className="truncate text-xs text-muted-foreground">
                        v{p.appVersion}
                        {p.buildNumber ? ` · build ${p.buildNumber}` : null}
                      </div>
                    ) : p.browsers && p.browsers.length > 0 ? (
                      // Web rows don't have an app version; show every
                      // distinct browser + version the profile has used
                      // so the row matches the visual shape of the iOS
                      // / Android rows. Truncates with ellipsis when
                      // the list is long.
                      <div
                        className="truncate text-xs text-muted-foreground"
                        title={p.browsers.join(', ')}
                      >
                        {p.browsers.join(', ')}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  <div>
                    {p.sessions.toLocaleString()}{' '}
                    {p.sessions === 1 ? 'session' : 'sessions'}
                  </div>
                  {p.lastSeen ? (
                    <div>{timeAgoShort(new Date(p.lastSeen))}</div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Widget>
  );
}

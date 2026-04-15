import { useSuspenseQuery } from '@tanstack/react-query';
import { FlameIcon } from 'lucide-react';
import { useTRPC } from '@/integrations/trpc/react';
import { Widget, WidgetEmptyState } from '@/components/widget';
import { WidgetHead } from '@/components/overview/overview-widget';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { ProjectLink } from '@/components/links';
import { timeAgoShort } from '@/utils/date';
import { getProfileName } from '@/utils/getters';

type Props = {
  groupId: string;
  projectId: string;
};

/**
 * "Power users in this team" — the members generating the most events
 * inside this group. Useful for account-managers: if the two biggest
 * users churn, is the team at risk? Who are our champions worth
 * nurturing? Top 5 only to keep the card compact — the full member
 * list is one click away under the "Members" tab.
 */
export function GroupTopMembers({ groupId, projectId }: Props) {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(
    trpc.group.topMembers.queryOptions({ id: groupId, projectId, take: 5 }),
  );

  return (
    <Widget className="w-full">
      <WidgetHead>
        <div className="title flex items-center gap-2">
          <FlameIcon className="size-4 text-amber-500" />
          Power users in this team
        </div>
      </WidgetHead>

      {data.length === 0 ? (
        <WidgetEmptyState icon={FlameIcon} text="No activity yet" />
      ) : (
        <ul className="flex flex-col divide-y">
          {data.map((m) => (
            <li
              key={m.profile.id}
              className="flex items-center justify-between gap-3 p-3 first:pt-3 last:pb-3"
            >
              <ProjectLink
                href={`/profiles/${encodeURIComponent(m.profile.id)}`}
                className="flex min-w-0 items-center gap-3 hover:underline"
              >
                <ProfileAvatar size="sm" {...m.profile} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {getProfileName(m.profile)}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    Last active{' '}
                    {m.lastSeen ? timeAgoShort(new Date(m.lastSeen)) : '—'}
                  </div>
                </div>
              </ProjectLink>
              <div className="shrink-0 text-right">
                <div className="font-mono text-sm tabular-nums">
                  {m.eventCount.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">events</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}

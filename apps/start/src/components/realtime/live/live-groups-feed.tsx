import { useQuery } from '@tanstack/react-query';
import { Building2Icon } from 'lucide-react';
import { FEED_CLOCK_MS } from './live-constants';
import { formatAge, LiveFeed, LiveFeedItem } from './live-feed';
import { useNow } from './use-live-feed';
import { useRealtimeFilters } from './use-realtime-filters';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';

export function LiveGroupsFeed({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const number = useNumber();
  const { filters } = useRealtimeFilters();
  const query = useQuery(
    trpc.realtime.activeGroups.queryOptions({ projectId, filters })
  );
  const now = useNow(FEED_CLOCK_MS);

  return (
    <LiveFeed
      emptyText={query.isSuccess ? 'No active groups right now' : undefined}
      items={query.data ?? []}
      renderItem={(group) => (
        <LiveFeedItem
          detail={group.type}
          icon={<Building2Icon className="size-3.5 text-muted-foreground" />}
          link={{ to: '/groups/$groupId', params: { groupId: group.id } }}
          title={group.name}
          trailing={
            <>
              <span>{number.format(group.people)}</span>
              <span>{formatAge(group.lastSeenAt, now)}</span>
            </>
          }
        />
      )}
      storageKey="groups"
      title="Groups"
    />
  );
}

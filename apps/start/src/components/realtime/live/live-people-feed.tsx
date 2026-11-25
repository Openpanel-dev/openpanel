import { useQuery } from '@tanstack/react-query';
import { getProfileDisplayName } from '../map/map-utils';
import { FEED_CLOCK_MS } from './live-constants';
import { formatAge, LiveFeed, LiveFeedItem } from './live-feed';
import { useNow } from './use-live-feed';
import { useRealtimeFilters } from './use-realtime-filters';
import { ProfileAvatar } from '@/components/profiles/profile-avatar';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { useTRPC } from '@/integrations/trpc/react';

export function LivePeopleFeed({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const { filters } = useRealtimeFilters();
  const query = useQuery(
    trpc.realtime.activePeople.queryOptions({ projectId, filters })
  );
  const now = useNow(FEED_CLOCK_MS);

  return (
    <LiveFeed
      emptyText={query.isSuccess ? 'No identified users right now' : undefined}
      items={query.data ?? []}
      renderItem={(person) => (
        <LiveFeedItem
          detail={
            person.groups.map((group) => group.name).join(', ') ||
            person.path ||
            undefined
          }
          icon={
            <ProfileAvatar
              avatar={person.avatar}
              email={person.email}
              firstName={person.firstName}
              lastName={person.lastName}
              size="xs"
            />
          }
          link={{
            to: '/profiles/$profileId',
            params: { profileId: person.id },
          }}
          title={getProfileDisplayName(person)}
          trailing={
            <>
              <SerieIcon name={person.country} />
              <span>{formatAge(person.lastSeenAt, now)}</span>
            </>
          }
        />
      )}
      storageKey="people"
      title="People"
    />
  );
}

import { useQuery } from '@tanstack/react-query';
import { GlobeIcon } from 'lucide-react';
import { FEED_CLOCK_MS } from './live-constants';
import { formatAge, LiveFeed, LiveFeedItem } from './live-feed';
import { useLiveFeed, useNow } from './use-live-feed';
import { useRealtimeFilters } from './use-realtime-filters';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { useTRPC } from '@/integrations/trpc/react';
import { getCountry } from '@/translations/countries';

export function LiveSessionFeed({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const { filters, filtersKey } = useRealtimeFilters();
  const query = useQuery(
    trpc.realtime.recentSessions.queryOptions({ projectId, filters })
  );
  const sessions = useLiveFeed(query.data, filtersKey);
  const now = useNow(FEED_CLOCK_MS);

  return (
    <LiveFeed
      items={sessions}
      renderItem={(session) => (
        <LiveFeedItem
          detail={session.path || undefined}
          icon={
            session.country ? (
              <SerieIcon name={session.country} />
            ) : (
              <GlobeIcon className="size-3.5 text-muted-foreground" />
            )
          }
          link={{
            to: '/sessions/$sessionId',
            params: { sessionId: session.sessionId },
          }}
          title={
            session.city || getCountry(session.country) || 'Unknown location'
          }
          trailing={
            <>
              <SerieIcon name={session.referrerName} />
              <SerieIcon name={session.device} />
              <span>{formatAge(session.createdAt, now)}</span>
            </>
          }
        />
      )}
      storageKey="sessions"
      title="New sessions"
    />
  );
}

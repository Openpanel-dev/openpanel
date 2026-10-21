import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { FEED_CLOCK_MS } from './live-constants';
import { formatAge, LiveFeed, LiveFeedItem } from './live-feed';
import { useLiveFeed, useNow } from './use-live-feed';
import { EventIcon } from '@/components/events/event-icon';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { useTRPC } from '@/integrations/trpc/react';
import { getCountry } from '@/translations/countries';

const PAGE_VIEW_EVENT = 'screen_view';
/** Session boundaries already show in the sessions feed. */
const SESSION_EVENTS = new Set(['session_start', 'session_end']);

export function LiveEventFeed({ projectId }: { projectId: string }) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.realtime.activeSessions.queryOptions({ projectId })
  );
  const visibleEvents = useMemo(
    () => query.data?.filter((event) => !SESSION_EVENTS.has(event.name)),
    [query.data]
  );
  const events = useLiveFeed(visibleEvents);
  const now = useNow(FEED_CLOCK_MS);

  return (
    <LiveFeed
      items={events}
      renderItem={(event) => {
        const isPageView = event.name === PAGE_VIEW_EVENT;
        return (
          <LiveFeedItem
            detail={event.city || getCountry(event.country)}
            icon={<EventIcon className="size-4" name={event.name} size="xs" />}
            sessionId={event.sessionId}
            title={isPageView ? event.path || '/' : event.name}
            trailing={
              <>
                <SerieIcon name={event.country} />
                <span>{formatAge(event.createdAt, now)}</span>
              </>
            }
          />
        );
      }}
      title="Events"
    />
  );
}

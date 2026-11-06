import { type QueryFilters, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import useWS from '@/hooks/use-ws';
import { useTRPC } from '@/integrations/trpc/react';

interface Props {
  projectId: string;
}

/** The feeds refresh this often while events keep arriving. */
const FEED_REFRESH_MS = 5000;
/** The map dots, histogram and top sources refresh this often regardless. */
const SUMMARY_REFRESH_MS = 20_000;

/**
 * Keeps the realtime page fresh on a fixed cadence. The websocket only says
 * that something arrived; it never triggers a refetch by itself, so a busy
 * project costs the same handful of queries as a quiet one.
 */
const RealtimeReloader = ({ projectId }: Props) => {
  const client = useQueryClient();
  const trpc = useTRPC();
  const hasNewEvents = useRef(false);

  useWS<number>(`/live/events/${projectId}`, () => {
    hasNewEvents.current = true;
  });

  useEffect(() => {
    // Active only: hidden widgets and filters no longer in use stay in the cache.
    const refetch = (filters: QueryFilters) =>
      client.refetchQueries({ ...filters, type: 'active' });

    const refreshFeeds = () => {
      if (document.hidden || !hasNewEvents.current) {
        return;
      }
      hasNewEvents.current = false;
      refetch(trpc.realtime.recentSessions.queryFilter({ projectId }));
      refetch(trpc.realtime.activeSessions.queryFilter({ projectId }));
      refetch(trpc.realtime.activePeople.queryFilter({ projectId }));
      refetch(trpc.realtime.activeGroups.queryFilter({ projectId }));
    };
    // Summaries refresh even with no new events: sessions leave the window too.
    const refreshSummaries = () => {
      if (document.hidden) {
        return;
      }
      refetch(trpc.realtime.coordinates.queryFilter({ projectId }));
      refetch(trpc.realtime.histogram.queryFilter({ projectId }));
      refetch(trpc.realtime.topSources.queryFilter({ projectId }));
      refetch(trpc.realtime.topPages.queryFilter({ projectId }));
      refetch(trpc.realtime.onlineCount.queryFilter({ projectId }));
      refetch(trpc.realtime.filterOptions.queryFilter({ projectId }));
    };
    const feeds = setInterval(refreshFeeds, FEED_REFRESH_MS);
    const summaries = setInterval(refreshSummaries, SUMMARY_REFRESH_MS);
    return () => {
      clearInterval(feeds);
      clearInterval(summaries);
    };
  }, [client, trpc, projectId]);

  return null;
};

export default RealtimeReloader;

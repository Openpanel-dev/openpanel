import { useQueryClient } from '@tanstack/react-query';
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
    const refreshFeeds = () => {
      if (document.hidden || !hasNewEvents.current) {
        return;
      }
      hasNewEvents.current = false;
      client.refetchQueries(
        trpc.realtime.recentSessions.queryFilter({ projectId })
      );
      client.refetchQueries(
        trpc.realtime.activeSessions.queryFilter({ projectId })
      );
    };
    // Summaries refresh even with no new events: sessions leave the window too.
    const refreshSummaries = () => {
      if (document.hidden) {
        return;
      }
      client.refetchQueries(
        trpc.realtime.coordinates.queryFilter({ projectId })
      );
      client.refetchQueries(trpc.realtime.histogram.queryFilter({ projectId }));
      client.refetchQueries(
        trpc.realtime.topSources.queryFilter({ projectId })
      );
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

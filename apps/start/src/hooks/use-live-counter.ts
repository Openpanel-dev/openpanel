import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useDebounceState } from './use-debounce-state';
import useWS from './use-ws';
import { useTRPC } from '@/integrations/trpc/react';

const FIFTEEN_SECONDS = 1000 * 15;
/** Refetch from API when WS-only updates may be stale (e.g. visitors left). */
const FALLBACK_STALE_MS = 1000 * 60;

export function useLiveCounter({
  projectId,
  shareId,
  onRefresh,
}: {
  projectId: string;
  shareId?: string;
  onRefresh?: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const counter = useDebounceState(0, 1000);
  const lastRefresh = useRef(Date.now());
  const query = useQuery(
    trpc.overview.liveVisitors.queryOptions({
      projectId,
      shareId: shareId ?? undefined,
    })
  );

  useEffect(() => {
    if (query.data) {
      counter.set(query.data);
    }
  }, [query.data]);

  useWS<number>(
    `/live/visitors/${projectId}`,
    (value) => {
      if (!Number.isNaN(value)) {
        counter.set(value);
        if (Date.now() - lastRefresh.current > FIFTEEN_SECONDS) {
          lastRefresh.current = Date.now();
          if (!document.hidden) {
            onRefresh?.();
          }
        }
      }
    },
    {
      debounce: {
        delay: 1000,
        maxWait: 5000,
      },
    }
  );

  useEffect(() => {
    const id = setInterval(async () => {
      if (Date.now() - lastRefresh.current < FALLBACK_STALE_MS) {
        return;
      }
      const data = await queryClient.fetchQuery(
        trpc.overview.liveVisitors.queryOptions(
          {
            projectId,
            shareId: shareId ?? undefined,
          },
          // Default query staleTime is 5m; bypass cache so this reconciliation always hits the API.
          { staleTime: 0 }
        )
      );
      counter.set(data);
      lastRefresh.current = Date.now();
    }, FALLBACK_STALE_MS);

    return () => clearInterval(id);
  }, [projectId, shareId, trpc, queryClient, counter.set]);

  return counter;
}

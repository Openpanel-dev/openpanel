import type { IServiceEvent } from '@openpanel/core';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { useTRPC } from '@/integrations/trpc/react';

// The list endpoint pages 50 events at a time; a session past this many pages
// is a bot or a tab left open, and the page would not be readable anyway.
const MAX_SESSION_EVENT_PAGES = 40;

type Trpc = ReturnType<typeof useTRPC>;

export function sessionEventsQueryOptions(
  trpc: Trpc,
  { projectId, sessionId }: { projectId: string; sessionId: string }
) {
  return trpc.event.events.infiniteQueryOptions(
    { projectId, sessionId, filters: [], columnVisibility: {} },
    {
      getNextPageParam: (lastPage, pages) => {
        const isLastPage =
          lastPage.data.length === 0 || pages.length >= MAX_SESSION_EVENT_PAGES;
        return isLastPage ? undefined : lastPage.meta.next;
      },
    }
  );
}

/** Every event in the session, loading the remaining pages in the background. */
export function useSessionEvents(
  trpc: Trpc,
  params: { projectId: string; sessionId: string }
): IServiceEvent[] {
  const query = useSuspenseInfiniteQuery(
    sessionEventsQueryOptions(trpc, params)
  );
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return useMemo(
    () => query.data.pages.flatMap((page) => page.data),
    [query.data]
  );
}

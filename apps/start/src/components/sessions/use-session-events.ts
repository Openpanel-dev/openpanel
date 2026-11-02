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

interface SessionEvents {
  events: IServiceEvent[];
  /** A later page failed, so `events` is only part of the session. */
  isIncomplete: boolean;
  retry: () => void;
}

/** Every event in the session, loading the remaining pages in the background. */
export function useSessionEvents(
  trpc: Trpc,
  params: { projectId: string; sessionId: string }
): SessionEvents {
  const query = useSuspenseInfiniteQuery(
    sessionEventsQueryOptions(trpc, params)
  );
  const {
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = query;

  // A failed page stops the chain; the page shows what loaded rather than retrying forever.
  useEffect(() => {
    if (hasNextPage && !(isFetchingNextPage || isFetchNextPageError)) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const events = useMemo(
    () => query.data.pages.flatMap((page) => page.data),
    [query.data]
  );
  return {
    events,
    isIncomplete: isFetchNextPageError,
    retry: () => fetchNextPage(),
  };
}

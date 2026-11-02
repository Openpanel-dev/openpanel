import type { IServiceEvent } from '@openpanel/core';
import { useSuspenseInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { useTRPC } from '@/integrations/trpc/react';

// The list endpoint pages 50 events at a time; a session past this many pages
// is a bot or a tab left open, and the page would not be readable anyway.
const MAX_SESSION_EVENT_PAGES = 40;
const EVENT_PAGE_SIZE = 50;
export const MAX_SESSION_EVENTS = MAX_SESSION_EVENT_PAGES * EVENT_PAGE_SIZE;

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

/**
 * `loading`: later pages are still coming. `failed`: a page failed and can be
 * retried. `capped`: the session has more events than the page will load.
 */
export type SessionEventsStatus = 'complete' | 'loading' | 'failed' | 'capped';

interface SessionEvents {
  events: IServiceEvent[];
  status: SessionEventsStatus;
  retry: () => void;
}

function getStatus({
  isFetchNextPageError,
  hasNextPage,
  isCapped,
}: {
  isFetchNextPageError: boolean;
  hasNextPage: boolean;
  isCapped: boolean;
}): SessionEventsStatus {
  if (isFetchNextPageError) {
    return 'failed';
  }
  if (hasNextPage) {
    return 'loading';
  }
  return isCapped ? 'capped' : 'complete';
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
  const pageCount = query.data.pages.length;
  // A short last page means the session ended inside the limit.
  const isLastPageFull =
    (query.data.pages.at(-1)?.data.length ?? 0) >= EVENT_PAGE_SIZE;
  const isCapped =
    !hasNextPage && pageCount >= MAX_SESSION_EVENT_PAGES && isLastPageFull;

  return {
    events,
    status: getStatus({ isFetchNextPageError, hasNextPage, isCapped }),
    retry: () => fetchNextPage(),
  };
}

import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import superjson from 'superjson';

import { TRPCProvider } from '@/integrations/trpc/react';
import type { AppRouter } from '@openpanel/trpc';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { useMemo } from 'react';

export const getIsomorphicHeaders = createIsomorphicFn()
  .server(() => {
    return getRequestHeaders();
  })
  .client(() => {
    return {};
  });

// Create a function that returns a tRPC client with optional cookies
export function createTRPCClientWithHeaders(apiUrl: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        transformer: superjson,
        url: `${apiUrl}/trpc`,
        headers: () => getIsomorphicHeaders(),
        fetch: (url, options) => {
          return fetch(url, {
            ...options,
            mode: 'cors',
            credentials: 'include',
          });
        },
      }),
    ],
  });
}

export function getContext(apiUrl: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Cache data for 1 hour before considering it stale
        staleTime: 1000 * 60 * 60,
        // Keep unused data in cache for 2 hours
        gcTime: 1000 * 60 * 120,
        // Don't refetch on reconnect (reduces unnecessary queries)
        refetchOnReconnect: false,
        // Don't refetch on window focus (reduces unnecessary queries)
        refetchOnWindowFocus: false,
        // Don't refetch on mount if data is fresh (reduces unnecessary queries)
        refetchOnMount: false,
        // Retry failed queries only once
        retry: 1,
      },
      dehydrate: { serializeData: superjson.serialize },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });

  // Create a tRPC client with cookies if provided
  const client = createTRPCClientWithHeaders(apiUrl);

  const serverHelpers = createTRPCOptionsProxy({
    client: client,
    queryClient: queryClient,
  });
  return {
    queryClient,
    trpc: serverHelpers,
  };
}

export function Provider({
  children,
  queryClient,
  apiUrl,
}: {
  children: React.ReactNode;
  queryClient: QueryClient;
  apiUrl: string;
}) {
  const trpcClient = useMemo(
    () => createTRPCClientWithHeaders(apiUrl),
    [apiUrl],
  );
  return (
    <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      {children}
    </TRPCProvider>
  );
}

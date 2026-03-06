import type { AppRouter } from '@openpanel/trpc';
import { QueryClient } from '@tanstack/react-query';
import { createIsomorphicFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { createTRPCClient, httpLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { useMemo } from 'react';
import superjson from 'superjson';
import { TRPCProvider } from '@/integrations/trpc/react';

export const getIsomorphicHeaders = createIsomorphicFn()
  .server(() => {
    const headers = getRequestHeaders();
    const result: Record<string, string> = {};
    // Only forward the cookie header so the API can validate the session.
    // Forwarding all headers causes problems with hop-by-hop headers like
    // `Connection: upgrade` (common in NGINX WebSocket configs) which makes
    // Node.js undici throw UND_ERR_INVALID_ARG ("fetch failed").
    const cookie = headers.get('Cookie');
    if (cookie) {
      result.cookie = cookie;
    }
    return result;
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
        fetch: async (url, options) => {
          try {
            const response = await fetch(url, {
              ...options,
              mode: 'cors',
              credentials: 'include',
            });

            // Log HTTP errors on server
            if (!response.ok && typeof window === 'undefined') {
              const text = await response.clone().text();
              console.error('[tRPC SSR Error]', {
                url: url.toString(),
                status: response.status,
                statusText: response.statusText,
                body: text,
                options,
              });
            }

            return response;
          } catch (error) {
            // Log fetch errors on server
            if (typeof window === 'undefined') {
              console.error('[tRPC SSR Error]', {
                url: url.toString(),
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                options,
              });
            }
            throw error;
          }
        },
      }),
    ],
  });
}

export function getContext(apiUrl: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 10,
        refetchOnReconnect: false,
      },
      dehydrate: { serializeData: superjson.serialize },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });

  // Create a tRPC client with cookies if provided
  const client = createTRPCClientWithHeaders(apiUrl);

  const serverHelpers = createTRPCOptionsProxy({
    client,
    queryClient,
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
    [apiUrl]
  );
  return (
    <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
      {children}
    </TRPCProvider>
  );
}

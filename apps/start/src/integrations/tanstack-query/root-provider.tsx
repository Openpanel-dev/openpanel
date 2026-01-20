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
    const headers = getRequestHeaders();
    // Filter out headers that shouldn't be forwarded to the API
    // - host: Would send wrong host (dashboard host instead of API host)
    // - connection: Hop-by-hop header
    // - upgrade-insecure-requests: Browser-specific
    // - sec-*: Browser security headers not relevant for server-to-server
    const forwardHeaders: Record<string, string> = {};
    const skipHeaders = new Set([
      'host',
      'connection',
      'upgrade-insecure-requests',
      'sec-fetch-dest',
      'sec-fetch-mode',
      'sec-fetch-site',
      'sec-fetch-user',
      'sec-ch-ua',
      'sec-ch-ua-mobile',
      'sec-ch-ua-platform',
    ]);

    for (const [key, value] of Object.entries(headers)) {
      if (!skipHeaders.has(key.toLowerCase()) && value) {
        forwardHeaders[key] = value;
      }
    }

    return forwardHeaders;
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
          const isServer = typeof window === 'undefined';

          // Build fetch options differently for server vs client
          // Server (Node.js): Don't use browser-specific options like mode/credentials
          // Also filter out signal: null which can cause issues in undici
          const fetchOptions: RequestInit = {
            method: options?.method,
            headers: options?.headers,
            body: options?.body,
          };

          // Only add browser-specific options on client
          if (!isServer) {
            fetchOptions.mode = 'cors';
            fetchOptions.credentials = 'include';
          }

          // Only pass signal if it's a valid AbortSignal (not null)
          if (options?.signal) {
            fetchOptions.signal = options.signal;
          }

          try {
            const response = await fetch(url, fetchOptions);

            // Log HTTP errors on server
            if (!response.ok && isServer) {
              const text = await response.clone().text();
              console.error('[tRPC SSR Error]', {
                url: url.toString(),
                status: response.status,
                statusText: response.statusText,
                body: text,
              });
            }

            return response;
          } catch (error) {
            // Log fetch errors on server
            if (isServer) {
              console.error('[tRPC SSR Error]', {
                url: url.toString(),
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                cause:
                  error instanceof Error && error.cause
                    ? String(error.cause)
                    : undefined,
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

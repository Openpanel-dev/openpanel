import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import superjson from 'superjson';

import { TRPCProvider } from '@/integrations/trpc/react';
import type { AppRouter } from '@openpanel/trpc';
import { createIsomorphicFn } from '@tanstack/react-start';
import { type HTTPHeaderName, getHeaders } from '@tanstack/react-start/server';

type Headers = Partial<Record<HTTPHeaderName, string | undefined>>;

function getUrl() {
  // const base = (() => {
  //   if (typeof window !== 'undefined') return ''
  //   return `http://localhost:${process.env.PORT ?? 3000}`
  // })()
  return 'http://localhost:3333/trpc';
}

export const getIsomorphicHeaders = createIsomorphicFn()
  .server(() => {
    return getHeaders();
  })
  .client(() => ({}));

// Create a function that returns a tRPC client with optional cookies
export function createTRPCClientWithHeaders(headers?: Headers) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        transformer: superjson,
        url: getUrl(),
        headers,
        maxItems: 3,
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

// Default client for client-side usage
export const trpcClient = createTRPCClientWithHeaders();

export function getContext(headers: Headers) {
  const queryClient = new QueryClient({
    defaultOptions: {
      dehydrate: { serializeData: superjson.serialize },
      hydrate: { deserializeData: superjson.deserialize },
    },
  });

  // Create a tRPC client with cookies if provided
  const client = createTRPCClientWithHeaders(headers);

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
}: {
  children: React.ReactNode;
  queryClient: QueryClient;
}) {
  return (
    <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      {children}
    </TRPCProvider>
  );
}

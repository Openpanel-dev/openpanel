'use client';

import React, { useRef, useState } from 'react';
import { api } from '@/app/_trpc/client';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ModalProvider } from '@/modals';
import type { AppStore } from '@/redux';
import makeStore from '@/redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import type { Session } from 'next-auth';
import { SessionProvider } from 'next-auth/react';
import type { RequestCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import { Provider as ReduxProvider } from 'react-redux';
import superjson from 'superjson';

import { CookieProvider } from './cookie-provider';

export default function Providers({
  children,
  session,
  cookies,
}: {
  children: React.ReactNode;
  session: Session | null;
  cookies: RequestCookie[];
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnMount: true,
            refetchOnWindowFocus: false,
          },
        },
      })
  );
  const [trpcClient] = useState(() =>
    api.createClient({
      transformer: superjson,
      links: [
        httpBatchLink({
          url: 'http://localhost:3000/api/trpc',
        }),
      ],
    })
  );

  const storeRef = useRef<AppStore>();
  if (!storeRef.current) {
    // Create the store instance the first time this renders
    storeRef.current = makeStore();
  }

  return (
    <SessionProvider session={session}>
      <ReduxProvider store={storeRef.current}>
        <api.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider delayDuration={200}>
              <CookieProvider value={cookies}>{children}</CookieProvider>
              <Toaster />
              <ModalProvider />
            </TooltipProvider>
          </QueryClientProvider>
        </api.Provider>
      </ReduxProvider>
    </SessionProvider>
  );
}

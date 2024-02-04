'use client';

import React, { useRef, useState } from 'react';
import { api } from '@/app/_trpc/client';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ModalProvider } from '@/modals';
import type { AppStore } from '@/redux';
import makeStore from '@/redux';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpLink } from '@trpc/client';
import type { Session } from 'next-auth';
import { SessionProvider } from 'next-auth/react';
import { Provider as ReduxProvider } from 'react-redux';
import superjson from 'superjson';

export default function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            networkMode: 'always',
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
        httpLink({
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
              {children}
              <Toaster />
              <ModalProvider />
            </TooltipProvider>
          </QueryClientProvider>
        </api.Provider>
      </ReduxProvider>
    </SessionProvider>
  );
}

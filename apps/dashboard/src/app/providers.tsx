'use client';

import React, { useRef, useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ModalProvider } from '@/modals';
import type { AppStore } from '@/redux';
import makeStore from '@/redux';
import { api } from '@/trpc/client';
import { ClerkProvider, useAuth } from '@clerk/nextjs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpLink } from '@trpc/client';
import { ThemeProvider } from 'next-themes';
import { Provider as ReduxProvider } from 'react-redux';
import { Toaster } from 'sonner';
import superjson from 'superjson';

import { OpenpanelProvider } from '@openpanel/nextjs';

function AllProviders({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
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
          url: `${process.env.NEXT_PUBLIC_API_URL}/trpc`,
          fetch(url, options) {
            // Send cookies
            return fetch(url, {
              ...options,
              credentials: 'include',
              mode: 'cors',
            });
          },
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
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      disableTransitionOnChange
    >
      <OpenpanelProvider
        clientId="7f1a992c-12bf-4def-b636-4aee3139e85d"
        profileId={userId || undefined}
        trackScreenViews
        trackOutgoingLinks
      />
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
    </ThemeProvider>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <AllProviders>{children}</AllProviders>
    </ClerkProvider>
  );
}

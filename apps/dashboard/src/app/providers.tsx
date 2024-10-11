'use client';

import { TooltipProvider } from '@/components/ui/tooltip';
import { ModalProvider } from '@/modals';
import type { AppStore } from '@/redux';
import makeStore from '@/redux';
import { api } from '@/trpc/client';
import { ClerkProvider, useAuth } from '@clerk/nextjs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpLink } from '@trpc/client';
import { ThemeProvider } from 'next-themes';
import type React from 'react';
import { useRef, useState } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { Toaster } from 'sonner';
import superjson from 'superjson';

import { NotificationProvider } from '@/components/notifications/notification-provider';
import { OpenPanelComponent } from '@openpanel/nextjs';

function AllProviders({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
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
      }),
  );
  const [trpcClient] = useState(() =>
    api.createClient({
      transformer: superjson,
      links: [
        httpLink({
          url: `${process.env.NEXT_PUBLIC_API_URL}/trpc`,
          async headers() {
            const token = await getToken();
            if (token) {
              return {
                Authorization: `Bearer ${token}`,
              };
            }
            return {};
          },
        }),
      ],
    }),
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
      {process.env.NEXT_PUBLIC_OP_CLIENT_ID && (
        <OpenPanelComponent
          clientId={process.env.NEXT_PUBLIC_OP_CLIENT_ID}
          trackScreenViews
          trackOutgoingLinks
          trackAttributes
        />
      )}
      <ReduxProvider store={storeRef.current}>
        <api.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <TooltipProvider delayDuration={200}>
              {children}
              <NotificationProvider />
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

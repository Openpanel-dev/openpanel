import { NotificationProvider } from '@/components/notifications/notification-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ModalProvider } from '@/modals';
import type { AppStore } from '@/redux';
import makeStore from '@/redux';
// import { OpenPanelComponent } from '@openpanel/nextjs';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import { useRef } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { Toaster } from 'sonner';

// TODO: Add theme provider
function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore>(undefined);
  if (!storeRef.current) {
    // Create the store instance the first time this renders
    storeRef.current = makeStore();
  }

  return (
    <NuqsAdapter>
      <ThemeProvider
        attribute="class"
        disableTransitionOnChange
        defaultTheme="system"
      >
        {/* {import.meta.env.VITE_OP_CLIENT_ID && (
          <OpenPanelComponent
            clientId={import.meta.env.VITE_OP_CLIENT_ID}
            trackScreenViews
            trackOutgoingLinks
            trackAttributes
          />
        )} */}
        <ReduxProvider store={storeRef.current}>
          <TooltipProvider delayDuration={200}>
            {children}
            {/* <NotificationProvider /> */}
            <Toaster />
            <ModalProvider />
          </TooltipProvider>
        </ReduxProvider>
      </ThemeProvider>
    </NuqsAdapter>
  );
}

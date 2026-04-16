import { ChatStateProvider } from '@/components/chat/chat-context';
import { NotificationProvider } from '@/components/notifications/notification-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PageContextProvider } from '@/contexts/page-context';
import { ModalProvider } from '@/modals';
import type { AppStore } from '@/redux';
import makeStore from '@/redux';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import { useRef } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { Toaster } from 'sonner';
import { ThemeProvider } from './theme-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore>(undefined);
  if (!storeRef.current) {
    storeRef.current = makeStore();
  }

  return (
    <NuqsAdapter>
      <ThemeProvider>
        <ReduxProvider store={storeRef.current}>
          <TooltipProvider delayDuration={200}>
            <PageContextProvider>
              <ChatStateProvider>
                {children}
                <NotificationProvider />
                <Toaster />
                <ModalProvider />
              </ChatStateProvider>
            </PageContextProvider>
          </TooltipProvider>
        </ReduxProvider>
      </ThemeProvider>
    </NuqsAdapter>
  );
}

import { ChatStateProvider } from '@/components/chat/chat-context';
import { NotificationProvider } from '@/components/notifications/notification-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PageContextProvider } from '@/contexts/page-context';
import { ModalProvider } from '@/modals';
import type { AppStore } from '@/redux';
import makeStore from '@/redux';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import { useRef } from 'react';
import { I18nextProvider } from 'react-i18next';
import { Provider as ReduxProvider } from 'react-redux';
import { Toaster } from 'sonner';
import i18n from '@/i18n';
import { I18nLanguageSync } from './i18n-language-sync';
import { ThemeProvider } from './theme-provider';

export function Providers({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore>(undefined);
  if (!storeRef.current) {
    storeRef.current = makeStore();
  }

  return (
    <NuqsAdapter>
      <I18nextProvider i18n={i18n}>
        <I18nLanguageSync />
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
      </I18nextProvider>
    </NuqsAdapter>
  );
}

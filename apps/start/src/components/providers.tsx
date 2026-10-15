import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import { useRef } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { Toaster } from 'sonner';
import { ThemeProvider } from './theme-provider';
import {
  ChartConfigProvider,
  type ChartConfigValue,
} from '@/components/charts/chart-config-context';
import { ChatStateProvider } from '@/components/chat/chat-context';
import { NotificationProvider } from '@/components/notifications/notification-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PageContextProvider } from '@/contexts/page-context';
import { ModalProvider } from '@/modals';
import type { AppStore } from '@/redux';
import makeStore from '@/redux';

// Dense time series are hovered bucket to bucket; bklit's default springs
// read as lag there.
const SNAPPY_SPRING = { stiffness: 1000, damping: 60 };
const CHART_CONFIG: ChartConfigValue = {
  tooltipSpring: SNAPPY_SPRING,
  tooltipBoxSpring: SNAPPY_SPRING,
  highlightSpring: SNAPPY_SPRING,
};

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
            <ChartConfigProvider value={CHART_CONFIG}>
              <PageContextProvider>
                <ChatStateProvider>
                  {children}
                  <NotificationProvider />
                  <Toaster />
                  <ModalProvider />
                </ChatStateProvider>
              </PageContextProvider>
            </ChartConfigProvider>
          </TooltipProvider>
        </ReduxProvider>
      </ThemeProvider>
    </NuqsAdapter>
  );
}

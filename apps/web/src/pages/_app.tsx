import { Suspense } from 'react';
import { Toaster } from '@/components/ui/toaster';
import store from '@/redux';
import { api } from '@/utils/api';
import type { Session } from 'next-auth';
import { SessionProvider } from 'next-auth/react';
import type { AppType } from 'next/app';
import { Space_Grotesk } from 'next/font/google';
import { Provider as ReduxProvider } from 'react-redux';

import '@/styles/globals.css';

import { TooltipProvider } from '@/components/ui/tooltip';
import { ModalProvider } from '@/modals';

const font = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--text',
});

const MixanApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  return (
    <div className={font.className}>
      <SessionProvider session={session}>
        <ReduxProvider store={store}>
          <Suspense fallback="Loading">
            <TooltipProvider delayDuration={200}>
              <Component {...pageProps} />
            </TooltipProvider>
            <Toaster />
            <ModalProvider />
          </Suspense>
        </ReduxProvider>
      </SessionProvider>
    </div>
  );
};

export default api.withTRPC(MixanApp);

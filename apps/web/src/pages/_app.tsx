import { type Session } from "next-auth";
import { SessionProvider, getSession } from "next-auth/react";
import App, {
  type AppContext,
  type AppInitialProps,
  type AppType,
} from "next/app";
import store from "@/redux";
import { Provider as ReduxProvider } from "react-redux";
import { Suspense } from "react";
import { Space_Grotesk } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";

import { api } from "@/utils/api";

import "@/styles/globals.css";
import { ModalProvider } from "@/modals";
import { TooltipProvider } from "@/components/ui/tooltip";

const font = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--text",
});

const MixanApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  console.log('session',session);
  
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

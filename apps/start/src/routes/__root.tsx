import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
  useRouteContext,
} from '@tanstack/react-router';

import 'flag-icons/css/flag-icons.min.css';
import 'katex/dist/katex.min.css';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import appCss from '../styles.css?url';

import type { QueryClient } from '@tanstack/react-query';

import { FullPageErrorState } from '@/components/full-page-error-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { Providers } from '@/components/providers';
import { ThemeScriptOnce } from '@/components/theme-provider';
import { LinkButton } from '@/components/ui/button';
import { getCookiesFn } from '@/hooks/use-cookie-store';
import { useSessionExtension } from '@/hooks/use-session-extension';
import { op } from '@/utils/op';
import type { AppRouter } from '@openpanel/trpc';
import type { TRPCOptionsProxy } from '@trpc/tanstack-react-query';

if (import.meta.env.VITE_OP_CLIENT_ID) {
  op.init();
}

interface MyRouterContext {
  queryClient: QueryClient;
  trpc: TRPCOptionsProxy<AppRouter>;
  apiUrl: string;
  dashboardUrl: string;
  isSelfHosted: boolean;
  isMaintenance: boolean;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async ({ context }) => {
    const [session, cookies] = await Promise.all([
      context.queryClient.ensureQueryData(
        context.trpc.auth.session.queryOptions(),
      ),
      getCookiesFn().catch(() => ({}) as Record<string, string>),
    ]);

    return { session, cookies };
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
    ],
    title: 'OpenPanel.dev',
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
  errorComponent: ({ error }) => (
    <FullPageErrorState
      title={'Something went wrong'}
      description={error.message}
    >
      <LinkButton href="/">Go back to home</LinkButton>
    </FullPageErrorState>
  ),
  pendingComponent: FullPageLoadingState,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  useSessionExtension();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="grainy min-h-screen bg-def-100 font-sans text-base antialiased leading-normal">
        <Providers>{children}</Providers>
        <ThemeScriptOnce />
        <Scripts />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.$ujq=window.$ujq||[];window.uj=window.uj||new Proxy({},{get:(_,p)=>(...a)=>window.$ujq.push([p,...a])});document.head.appendChild(Object.assign(document.createElement('script'),{src:'https://cdn.userjot.com/sdk/v2/uj.js',type:'module',async:!0}));`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.uj.init('cm6thlmwr03xr13jghznx87gk', { widget: true, trigger: 'custom' });`,
          }}
        />
        <div className="hidden">
          <div className="text-chart-0 bg-chart-0" />
          <div className="text-chart-1 bg-chart-1" />
          <div className="text-chart-2 bg-chart-2" />
          <div className="text-chart-3 bg-chart-3" />
          <div className="text-chart-4 bg-chart-4" />
          <div className="text-chart-5 bg-chart-5" />
          <div className="text-chart-6 bg-chart-6" />
          <div className="text-chart-7 bg-chart-7" />
          <div className="text-chart-8 bg-chart-8" />
          <div className="text-chart-9 bg-chart-9" />
          <div className="text-chart-10 bg-chart-10" />
          <div className="text-chart-11 bg-chart-11" />
          <div className="text-rose-50 bg-rose-50 hover:bg-rose-50 border-rose-50 dark:bg-rose-50 dark:hover:bg-rose-50" />
          <div className="text-rose-100 bg-rose-100 hover:bg-rose-100 border-rose-100 dark:bg-rose-100 dark:hover:bg-rose-100" />
          <div className="text-rose-200 bg-rose-200 hover:bg-rose-200 border-rose-200 dark:bg-rose-200 dark:hover:bg-rose-200" />
          <div className="text-rose-700 bg-rose-700 hover:bg-rose-700 border-rose-700 dark:bg-rose-700 dark:hover:bg-rose-700" />
          <div className="text-rose-800 bg-rose-800 hover:bg-rose-800 border-rose-800 dark:bg-rose-800 dark:hover:bg-rose-800" />
          <div className="text-rose-900 bg-rose-900 hover:bg-rose-900 border-rose-900 dark:bg-rose-900 dark:hover:bg-rose-900" />
          <div className="text-pink-50 bg-pink-50 hover:bg-pink-50 border-pink-50 dark:bg-pink-50 dark:hover:bg-pink-50" />
          <div className="text-pink-100 bg-pink-100 hover:bg-pink-100 border-pink-100 dark:bg-pink-100 dark:hover:bg-pink-100" />
          <div className="text-pink-200 bg-pink-200 hover:bg-pink-200 border-pink-200 dark:bg-pink-200 dark:hover:bg-pink-200" />
          <div className="text-pink-700 bg-pink-700 hover:bg-pink-700 border-pink-700 dark:bg-pink-700 dark:hover:bg-pink-700" />
          <div className="text-pink-800 bg-pink-800 hover:bg-pink-800 border-pink-800 dark:bg-pink-800 dark:hover:bg-pink-800" />
          <div className="text-pink-900 bg-pink-900 hover:bg-pink-900 border-pink-900 dark:bg-pink-900 dark:hover:bg-pink-900" />
          <div className="text-fuchsia-50 bg-fuchsia-50 hover:bg-fuchsia-50 border-fuchsia-50 dark:bg-fuchsia-50 dark:hover:bg-fuchsia-50" />
          <div className="text-fuchsia-100 bg-fuchsia-100 hover:bg-fuchsia-100 border-fuchsia-100 dark:bg-fuchsia-100 dark:hover:bg-fuchsia-100" />
          <div className="text-fuchsia-200 bg-fuchsia-200 hover:bg-fuchsia-200 border-fuchsia-200 dark:bg-fuchsia-200 dark:hover:bg-fuchsia-200" />
          <div className="text-fuchsia-700 bg-fuchsia-700 hover:bg-fuchsia-700 border-fuchsia-700 dark:bg-fuchsia-700 dark:hover:bg-fuchsia-700" />
          <div className="text-fuchsia-800 bg-fuchsia-800 hover:bg-fuchsia-800 border-fuchsia-800 dark:bg-fuchsia-800 dark:hover:bg-fuchsia-800" />
          <div className="text-fuchsia-900 bg-fuchsia-900 hover:bg-fuchsia-900 border-fuchsia-900 dark:bg-fuchsia-900 dark:hover:bg-fuchsia-900" />
          <div className="text-purple-50 bg-purple-50 hover:bg-purple-50 border-purple-50 dark:bg-purple-50 dark:hover:bg-purple-50" />
          <div className="text-purple-100 bg-purple-100 hover:bg-purple-100 border-purple-100 dark:bg-purple-100 dark:hover:bg-purple-100" />
          <div className="text-purple-200 bg-purple-200 hover:bg-purple-200 border-purple-200 dark:bg-purple-200 dark:hover:bg-purple-200" />
          <div className="text-purple-700 bg-purple-700 hover:bg-purple-700 border-purple-700 dark:bg-purple-700 dark:hover:bg-purple-700" />
          <div className="text-purple-800 bg-purple-800 hover:bg-purple-800 border-purple-800 dark:bg-purple-800 dark:hover:bg-purple-800" />
          <div className="text-purple-900 bg-purple-900 hover:bg-purple-900 border-purple-900 dark:bg-purple-900 dark:hover:bg-purple-900" />
          <div className="text-violet-50 bg-violet-50 hover:bg-violet-50 border-violet-50 dark:bg-violet-50 dark:hover:bg-violet-50" />
          <div className="text-violet-100 bg-violet-100 hover:bg-violet-100 border-violet-100 dark:bg-violet-100 dark:hover:bg-violet-100" />
          <div className="text-violet-200 bg-violet-200 hover:bg-violet-200 border-violet-200 dark:bg-violet-200 dark:hover:bg-violet-200" />
          <div className="text-violet-700 bg-violet-700 hover:bg-violet-700 border-violet-700 dark:bg-violet-700 dark:hover:bg-violet-700" />
          <div className="text-violet-800 bg-violet-800 hover:bg-violet-800 border-violet-800 dark:bg-violet-800 dark:hover:bg-violet-800" />
          <div className="text-violet-900 bg-violet-900 hover:bg-violet-900 border-violet-900 dark:bg-violet-900 dark:hover:bg-violet-900" />
          <div className="text-indigo-50 bg-indigo-50 hover:bg-indigo-50 border-indigo-50 dark:bg-indigo-50 dark:hover:bg-indigo-50" />
          <div className="text-indigo-100 bg-indigo-100 hover:bg-indigo-100 border-indigo-100 dark:bg-indigo-100 dark:hover:bg-indigo-100" />
          <div className="text-indigo-200 bg-indigo-200 hover:bg-indigo-200 border-indigo-200 dark:bg-indigo-200 dark:hover:bg-indigo-200" />
          <div className="text-indigo-700 bg-indigo-700 hover:bg-indigo-700 border-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-700" />
          <div className="text-indigo-800 bg-indigo-800 hover:bg-indigo-800 border-indigo-800 dark:bg-indigo-800 dark:hover:bg-indigo-800" />
          <div className="text-indigo-900 bg-indigo-900 hover:bg-indigo-900 border-indigo-900 dark:bg-indigo-900 dark:hover:bg-indigo-900" />
          <div className="text-blue-50 bg-blue-50 hover:bg-blue-50 border-blue-50 dark:bg-blue-50 dark:hover:bg-blue-50" />
          <div className="text-blue-100 bg-blue-100 hover:bg-blue-100 border-blue-100 dark:bg-blue-100 dark:hover:bg-blue-100" />
          <div className="text-blue-200 bg-blue-200 hover:bg-blue-200 border-blue-200 dark:bg-blue-200 dark:hover:bg-blue-200" />
          <div className="text-blue-700 bg-blue-700 hover:bg-blue-700 border-blue-700 dark:bg-blue-700 dark:hover:bg-blue-700" />
          <div className="text-blue-800 bg-blue-800 hover:bg-blue-800 border-blue-800 dark:bg-blue-800 dark:hover:bg-blue-800" />
          <div className="text-blue-900 bg-blue-900 hover:bg-blue-900 border-blue-900 dark:bg-blue-900 dark:hover:bg-blue-900" />
          <div className="text-sky-50 bg-sky-50 hover:bg-sky-50 border-sky-50 dark:bg-sky-50 dark:hover:bg-sky-50" />
          <div className="text-sky-100 bg-sky-100 hover:bg-sky-100 border-sky-100 dark:bg-sky-100 dark:hover:bg-sky-100" />
          <div className="text-sky-200 bg-sky-200 hover:bg-sky-200 border-sky-200 dark:bg-sky-200 dark:hover:bg-sky-200" />
          <div className="text-sky-700 bg-sky-700 hover:bg-sky-700 border-sky-700 dark:bg-sky-700 dark:hover:bg-sky-700" />
          <div className="text-sky-800 bg-sky-800 hover:bg-sky-800 border-sky-800 dark:bg-sky-800 dark:hover:bg-sky-800" />
          <div className="text-sky-900 bg-sky-900 hover:bg-sky-900 border-sky-900 dark:bg-sky-900 dark:hover:bg-sky-900" />
          <div className="text-cyan-50 bg-cyan-50 hover:bg-cyan-50 border-cyan-50 dark:bg-cyan-50 dark:hover:bg-cyan-50" />
          <div className="text-cyan-100 bg-cyan-100 hover:bg-cyan-100 border-cyan-100 dark:bg-cyan-100 dark:hover:bg-cyan-100" />
          <div className="text-cyan-200 bg-cyan-200 hover:bg-cyan-200 border-cyan-200 dark:bg-cyan-200 dark:hover:bg-cyan-200" />
          <div className="text-cyan-700 bg-cyan-700 hover:bg-cyan-700 border-cyan-700 dark:bg-cyan-700 dark:hover:bg-cyan-700" />
          <div className="text-cyan-800 bg-cyan-800 hover:bg-cyan-800 border-cyan-800 dark:bg-cyan-800 dark:hover:bg-cyan-800" />
          <div className="text-cyan-900 bg-cyan-900 hover:bg-cyan-900 border-cyan-900 dark:bg-cyan-900 dark:hover:bg-cyan-900" />
          <div className="text-teal-50 bg-teal-50 hover:bg-teal-50 border-teal-50 dark:bg-teal-50 dark:hover:bg-teal-50" />
          <div className="text-teal-100 bg-teal-100 hover:bg-teal-100 border-teal-100 dark:bg-teal-100 dark:hover:bg-teal-100" />
          <div className="text-teal-200 bg-teal-200 hover:bg-teal-200 border-teal-200 dark:bg-teal-200 dark:hover:bg-teal-200" />
          <div className="text-teal-700 bg-teal-700 hover:bg-teal-700 border-teal-700 dark:bg-teal-700 dark:hover:bg-teal-700" />
          <div className="text-teal-800 bg-teal-800 hover:bg-teal-800 border-teal-800 dark:bg-teal-800 dark:hover:bg-teal-800" />
          <div className="text-teal-900 bg-teal-900 hover:bg-teal-900 border-teal-900 dark:bg-teal-900 dark:hover:bg-teal-900" />
          <div className="text-emerald-50 bg-emerald-50 hover:bg-emerald-50 border-emerald-50 dark:bg-emerald-50 dark:hover:bg-emerald-50" />
          <div className="text-emerald-100 bg-emerald-100 hover:bg-emerald-100 border-emerald-100 dark:bg-emerald-100 dark:hover:bg-emerald-100" />
          <div className="text-emerald-200 bg-emerald-200 hover:bg-emerald-200 border-emerald-200 dark:bg-emerald-200 dark:hover:bg-emerald-200" />
          <div className="text-emerald-700 bg-emerald-700 hover:bg-emerald-700 border-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-700" />
          <div className="text-emerald-800 bg-emerald-800 hover:bg-emerald-800 border-emerald-800 dark:bg-emerald-800 dark:hover:bg-emerald-800" />
          <div className="text-emerald-900 bg-emerald-900 hover:bg-emerald-900 border-emerald-900 dark:bg-emerald-900 dark:hover:bg-emerald-900" />
          <div className="text-green-50 bg-green-50 hover:bg-green-50 border-green-50 dark:bg-green-50 dark:hover:bg-green-50" />
          <div className="text-green-100 bg-green-100 hover:bg-green-100 border-green-100 dark:bg-green-100 dark:hover:bg-green-100" />
          <div className="text-green-200 bg-green-200 hover:bg-green-200 border-green-200 dark:bg-green-200 dark:hover:bg-green-200" />
          <div className="text-green-700 bg-green-700 hover:bg-green-700 border-green-700 dark:bg-green-700 dark:hover:bg-green-700" />
          <div className="text-green-800 bg-green-800 hover:bg-green-800 border-green-800 dark:bg-green-800 dark:hover:bg-green-800" />
          <div className="text-green-900 bg-green-900 hover:bg-green-900 border-green-900 dark:bg-green-900 dark:hover:bg-green-900" />
          <div className="text-lime-50 bg-lime-50 hover:bg-lime-50 border-lime-50 dark:bg-lime-50 dark:hover:bg-lime-50" />
          <div className="text-lime-100 bg-lime-100 hover:bg-lime-100 border-lime-100 dark:bg-lime-100 dark:hover:bg-lime-100" />
          <div className="text-lime-200 bg-lime-200 hover:bg-lime-200 border-lime-200 dark:bg-lime-200 dark:hover:bg-lime-200" />
          <div className="text-lime-700 bg-lime-700 hover:bg-lime-700 border-lime-700 dark:bg-lime-700 dark:hover:bg-lime-700" />
          <div className="text-lime-800 bg-lime-800 hover:bg-lime-800 border-lime-800 dark:bg-lime-800 dark:hover:bg-lime-800" />
          <div className="text-lime-900 bg-lime-900 hover:bg-lime-900 border-lime-900 dark:bg-lime-900 dark:hover:bg-lime-900" />
          <div className="text-yellow-50 bg-yellow-50 hover:bg-yellow-50 border-yellow-50 dark:bg-yellow-50 dark:hover:bg-yellow-50" />
          <div className="text-yellow-100 bg-yellow-100 hover:bg-yellow-100 border-yellow-100 dark:bg-yellow-100 dark:hover:bg-yellow-100" />
          <div className="text-yellow-200 bg-yellow-200 hover:bg-yellow-200 border-yellow-200 dark:bg-yellow-200 dark:hover:bg-yellow-200" />
          <div className="text-yellow-700 bg-yellow-700 hover:bg-yellow-700 border-yellow-700 dark:bg-yellow-700 dark:hover:bg-yellow-700" />
          <div className="text-yellow-800 bg-yellow-800 hover:bg-yellow-800 border-yellow-800 dark:bg-yellow-800 dark:hover:bg-yellow-800" />
          <div className="text-yellow-900 bg-yellow-900 hover:bg-yellow-900 border-yellow-900 dark:bg-yellow-900 dark:hover:bg-yellow-900" />
          <div className="text-amber-50 bg-amber-50 hover:bg-amber-50 border-amber-50 dark:bg-amber-50 dark:hover:bg-amber-50" />
          <div className="text-amber-100 bg-amber-100 hover:bg-amber-100 border-amber-100 dark:bg-amber-100 dark:hover:bg-amber-100" />
          <div className="text-amber-200 bg-amber-200 hover:bg-amber-200 border-amber-200 dark:bg-amber-200 dark:hover:bg-amber-200" />
          <div className="text-amber-700 bg-amber-700 hover:bg-amber-700 border-amber-700 dark:bg-amber-700 dark:hover:bg-amber-700" />
          <div className="text-amber-800 bg-amber-800 hover:bg-amber-800 border-amber-800 dark:bg-amber-800 dark:hover:bg-amber-800" />
          <div className="text-amber-900 bg-amber-900 hover:bg-amber-900 border-amber-900 dark:bg-amber-900 dark:hover:bg-amber-900" />
          <div className="text-orange-50 bg-orange-50 hover:bg-orange-50 border-orange-50 dark:bg-orange-50 dark:hover:bg-orange-50" />
          <div className="text-orange-100 bg-orange-100 hover:bg-orange-100 border-orange-100 dark:bg-orange-100 dark:hover:bg-orange-100" />
          <div className="text-orange-200 bg-orange-200 hover:bg-orange-200 border-orange-200 dark:bg-orange-200 dark:hover:bg-orange-200" />
          <div className="text-orange-700 bg-orange-700 hover:bg-orange-700 border-orange-700 dark:bg-orange-700 dark:hover:bg-orange-700" />
          <div className="text-orange-800 bg-orange-800 hover:bg-orange-800 border-orange-800 dark:bg-orange-800 dark:hover:bg-orange-800" />
          <div className="text-orange-900 bg-orange-900 hover:bg-orange-900 border-orange-900 dark:bg-orange-900 dark:hover:bg-orange-900" />
          <div className="text-red-50 bg-red-50 hover:bg-red-50 border-red-50 dark:bg-red-50 dark:hover:bg-red-50" />
          <div className="text-red-100 bg-red-100 hover:bg-red-100 border-red-100 dark:bg-red-100 dark:hover:bg-red-100" />
          <div className="text-red-200 bg-red-200 hover:bg-red-200 border-red-200 dark:bg-red-200 dark:hover:bg-red-200" />
          <div className="text-red-700 bg-red-700 hover:bg-red-700 border-red-700 dark:bg-red-700 dark:hover:bg-red-700" />
          <div className="text-red-800 bg-red-800 hover:bg-red-800 border-red-800 dark:bg-red-800 dark:hover:bg-red-800" />
          <div className="text-red-900 bg-red-900 hover:bg-red-900 border-red-900 dark:bg-red-900 dark:hover:bg-red-900" />
          <div className="text-stone-50 bg-stone-50 hover:bg-stone-50 border-stone-50 dark:bg-stone-50 dark:hover:bg-stone-50" />
          <div className="text-stone-100 bg-stone-100 hover:bg-stone-100 border-stone-100 dark:bg-stone-100 dark:hover:bg-stone-100" />
          <div className="text-stone-200 bg-stone-200 hover:bg-stone-200 border-stone-200 dark:bg-stone-200 dark:hover:bg-stone-200" />
          <div className="text-stone-700 bg-stone-700 hover:bg-stone-700 border-stone-700 dark:bg-stone-700 dark:hover:bg-stone-700" />
          <div className="text-stone-800 bg-stone-800 hover:bg-stone-800 border-stone-800 dark:bg-stone-800 dark:hover:bg-stone-800" />
          <div className="text-stone-900 bg-stone-900 hover:bg-stone-900 border-stone-900 dark:bg-stone-900 dark:hover:bg-stone-900" />
          <div className="text-neutral-50 bg-neutral-50 hover:bg-neutral-50 border-neutral-50 dark:bg-neutral-50 dark:hover:bg-neutral-50" />
          <div className="text-neutral-100 bg-neutral-100 hover:bg-neutral-100 border-neutral-100 dark:bg-neutral-100 dark:hover:bg-neutral-100" />
          <div className="text-neutral-200 bg-neutral-200 hover:bg-neutral-200 border-neutral-200 dark:bg-neutral-200 dark:hover:bg-neutral-200" />
          <div className="text-neutral-700 bg-neutral-700 hover:bg-neutral-700 border-neutral-700 dark:bg-neutral-700 dark:hover:bg-neutral-700" />
          <div className="text-neutral-800 bg-neutral-800 hover:bg-neutral-800 border-neutral-800 dark:bg-neutral-800 dark:hover:bg-neutral-800" />
          <div className="text-neutral-900 bg-neutral-900 hover:bg-neutral-900 border-neutral-900 dark:bg-neutral-900 dark:hover:bg-neutral-900" />
          <div className="text-zinc-50 bg-zinc-50 hover:bg-zinc-50 border-zinc-50 dark:bg-zinc-50 dark:hover:bg-zinc-50" />
          <div className="text-zinc-100 bg-zinc-100 hover:bg-zinc-100 border-zinc-100 dark:bg-zinc-100 dark:hover:bg-zinc-100" />
          <div className="text-zinc-200 bg-zinc-200 hover:bg-zinc-200 border-zinc-200 dark:bg-zinc-200 dark:hover:bg-zinc-200" />
          <div className="text-zinc-700 bg-zinc-700 hover:bg-zinc-700 border-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-700" />
          <div className="text-zinc-800 bg-zinc-800 hover:bg-zinc-800 border-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-800" />
          <div className="text-zinc-900 bg-zinc-900 hover:bg-zinc-900 border-zinc-900 dark:bg-zinc-900 dark:hover:bg-zinc-900" />
          <div className="text-grey-50 bg-grey-50 hover:bg-grey-50 border-grey-50 dark:bg-grey-50 dark:hover:bg-grey-50" />
          <div className="text-grey-100 bg-grey-100 hover:bg-grey-100 border-grey-100 dark:bg-grey-100 dark:hover:bg-grey-100" />
          <div className="text-grey-200 bg-grey-200 hover:bg-grey-200 border-grey-200 dark:bg-grey-200 dark:hover:bg-grey-200" />
          <div className="text-grey-700 bg-grey-700 hover:bg-grey-700 border-grey-700 dark:bg-grey-700 dark:hover:bg-grey-700" />
          <div className="text-grey-800 bg-grey-800 hover:bg-grey-800 border-grey-800 dark:bg-grey-800 dark:hover:bg-grey-800" />
          <div className="text-grey-900 bg-grey-900 hover:bg-grey-900 border-grey-900 dark:bg-grey-900 dark:hover:bg-grey-900" />
          <div className="text-slate-50 bg-slate-50 hover:bg-slate-50 border-slate-50 dark:bg-slate-50 dark:hover:bg-slate-50" />
          <div className="text-slate-100 bg-slate-100 hover:bg-slate-100 border-slate-100 dark:bg-slate-100 dark:hover:bg-slate-100" />
          <div className="text-slate-200 bg-slate-200 hover:bg-slate-200 border-slate-200 dark:bg-slate-200 dark:hover:bg-slate-200" />
          <div className="text-slate-700 bg-slate-700 hover:bg-slate-700 border-slate-700 dark:bg-slate-700 dark:hover:bg-slate-700" />
          <div className="text-slate-800 bg-slate-800 hover:bg-slate-800 border-slate-800 dark:bg-slate-800 dark:hover:bg-slate-800" />
          <div className="text-slate-900 bg-slate-900 hover:bg-slate-900 border-slate-900 dark:bg-slate-900 dark:hover:bg-slate-900" />
        </div>
      </body>
    </html>
  );
}

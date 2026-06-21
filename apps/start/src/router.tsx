import { createRouter as createTanstackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import { useTranslation } from 'react-i18next';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { LinkButton } from '@/components/ui/button';
import * as TanstackQuery from './integrations/tanstack-query/root-provider';
import { routeTree } from './routeTree.gen';
import { getServerEnvs } from './server/get-envs';

export const getRouter = async () => {
  const envs = await getServerEnvs();
  const rqContext = TanstackQuery.getContext(envs.apiUrl);

  const router = createTanstackRouter({
    scrollRestoration: true,
    routeTree,
    context: {
      ...rqContext,
      ...envs,
      session: {
        session: null,
        user: null,
        userId: null,
      },
    },
    defaultPreload: 'intent',
    defaultNotFoundComponent: () => {
      const { t } = useTranslation();

      return (
        <FullPageEmptyState
          title={t('errors.page_not_found')}
          description={t('errors.page_not_found_description')}
          className="min-h-screen"
        >
          <LinkButton href="/">{t('common.go_home')}</LinkButton>
        </FullPageEmptyState>
      );
    },
    Wrap: (props: { children: React.ReactNode }) => {
      return (
        <TanstackQuery.Provider {...rqContext} apiUrl={envs.apiUrl}>
          {props.children}
        </TanstackQuery.Provider>
      );
    },
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient: rqContext.queryClient,
  });

  return router;
};

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}

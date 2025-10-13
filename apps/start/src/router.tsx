import { createRouter as createTanstackRouter } from '@tanstack/react-router';
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query';
import * as TanstackQuery from './integrations/tanstack-query/root-provider';

import { routeTree } from './routeTree.gen';
import { getServerEnvs } from './server/get-envs';

export const getRouter = async () => {
  const envs = await getServerEnvs();
  const headers = TanstackQuery.getIsomorphicHeaders();
  const rqContext = TanstackQuery.getContext(headers, envs.apiUrl);

  const router = createTanstackRouter({
    routeTree,
    context: {
      ...rqContext,
      apiUrl: envs.apiUrl,
      dashboardUrl: envs.dashboardUrl,
    },
    defaultPreload: 'intent',
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

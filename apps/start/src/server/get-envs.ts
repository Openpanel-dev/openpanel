import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

export const getServerEnvs = createServerFn().handler(() => {
  // The dashboard only needs OIDC_CLIENT_ID to know whether to render
  // the SSO sign-in button. The full validation (client secret +
  // endpoints) lives on the api pod where the OAuth flow actually
  // runs. This lets operators keep the OIDC secret confined to the
  // api pod without losing the button.
  const oidcConfigured = !!process.env.OIDC_CLIENT_ID;

  const envs = {
    apiUrl: String(process.env.API_URL || process.env.NEXT_PUBLIC_API_URL),
    dashboardUrl: String(
      process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL
    ),
    isSelfHosted: process.env.SELF_HOSTED !== undefined,
    isMaintenance: process.env.MAINTENANCE === '1',
    isDemo: process.env.DEMO_USER_ID !== undefined,
    oidc: {
      enabled: oidcConfigured,
      displayName: process.env.OIDC_DISPLAY_NAME || 'Single Sign-On',
    },
  };

  return envs;
});

export const getServerEnvsQueryOptions = queryOptions({
  queryKey: ['server-envs'],
  queryFn: getServerEnvs,
  staleTime: Number.POSITIVE_INFINITY,
});

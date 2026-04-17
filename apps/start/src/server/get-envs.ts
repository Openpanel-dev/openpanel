import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

export const getServerEnvs = createServerFn().handler(() => {
  const envs = {
    apiUrl: String(process.env.API_URL || process.env.NEXT_PUBLIC_API_URL),
    dashboardUrl: String(
      process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL
    ),
    isSelfHosted: process.env.SELF_HOSTED !== undefined,
    isMaintenance: process.env.MAINTENANCE === '1',
    isDemo: process.env.DEMO_USER_ID !== undefined,
  };

  return envs;
});

export const getServerEnvsQueryOptions = queryOptions({
  queryKey: ['server-envs'],
  queryFn: getServerEnvs,
  staleTime: Number.POSITIVE_INFINITY,
});

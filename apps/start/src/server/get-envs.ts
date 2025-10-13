import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

export const getServerEnvs = createServerFn().handler(async () => {
  const envs = {
    apiUrl: String(process.env.API_URL || process.env.NEXT_PUBLIC_API_URL),
    dashboardUrl: String(
      process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL,
    ),
  };

  return envs;
});

export const getServerEnvsQueryOptions = queryOptions({
  queryKey: ['server-envs'],
  queryFn: getServerEnvs,
  staleTime: Number.POSITIVE_INFINITY,
});

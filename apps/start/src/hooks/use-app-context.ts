import { useRouteContext } from '@tanstack/react-router';

export function useAppContext() {
  const params = useRouteContext({
    strict: false,
  });

  if (
    !params.apiUrl ||
    !params.dashboardUrl ||
    typeof params.isSelfHosted === 'undefined'
  ) {
    throw new Error('API URL or dashboard URL is not set');
  }

  return {
    apiUrl: params.apiUrl,
    dashboardUrl: params.dashboardUrl,
    isSelfHosted: params.isSelfHosted,
  };
}

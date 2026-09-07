import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/integrations/trpc/react';

const DISABLED = { github: false, google: false } as const;

/** Which social login buttons the server currently offers. */
export function useOAuthProviders() {
  const trpc = useTRPC();
  const query = useQuery(trpc.auth.getOAuthProviders.queryOptions());

  return {
    ...query,
    providers: query.data ?? DISABLED,
    hasAny:
      query.data !== undefined &&
      (query.data.github || query.data.google),
  };
}

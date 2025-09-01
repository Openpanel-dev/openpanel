import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

export function useAuth() {
  const trpc = useTRPC();
  return useQuery(trpc.auth.session.queryOptions());
}

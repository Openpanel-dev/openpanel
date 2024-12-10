import { api } from '@/trpc/client';

export function useAuth() {
  return api.auth.session.useQuery();
}

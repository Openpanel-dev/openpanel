import { useQueryClient } from '@tanstack/react-query';

export function useRefetchActive() {
  const client = useQueryClient();
  return () => client.refetchQueries({ type: 'active' });
}

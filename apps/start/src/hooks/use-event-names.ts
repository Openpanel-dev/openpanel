import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';

export function useEventNames(params: {
  projectId: string;
  anyEvents?: boolean;
}) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.chart.events.queryOptions(params, {
      enabled: !!params.projectId,
      staleTime: 1000 * 60 * 10,
    }),
  );
  return (query.data ?? []).filter((event) =>
    (params.anyEvents ?? true) ? true : event.name !== '*',
  );
}

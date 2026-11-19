import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/integrations/trpc/react';

export function useEventNames(params: {
  projectId: string;
  anyEvents?: boolean;
  enabled?: boolean;
}) {
  const trpc = useTRPC();
  const { enabled = true, ...input } = params;
  const query = useQuery(
    trpc.chart.events.queryOptions(input, {
      enabled: enabled !== false && !!params.projectId,
      staleTime: 1000 * 60 * 10,
    })
  );
  return (query.data ?? []).filter((event) =>
    (params.anyEvents ?? true) ? true : event.name !== '*'
  );
}

import { useTRPC } from '@/integrations/trpc/react';
import type { RouterInputs } from '@/trpc/client';
import { useQuery } from '@tanstack/react-query';

export function usePropertyValues(
  params: RouterInputs['chart']['values'] & { enabled?: boolean },
) {
  const trpc = useTRPC();
  const { enabled = true, ...input } = params;
  const query = useQuery(
    trpc.chart.values.queryOptions(input, {
      enabled: enabled !== false && !!input.projectId,
    }),
  );
  return query.data?.values ?? [];
}

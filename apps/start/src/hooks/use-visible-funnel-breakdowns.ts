import type { RouterOutputs } from '@/trpc/client';
import { useEffect, useMemo, useState } from 'react';

export type IVisibleFunnelBreakdowns = ReturnType<
  typeof useVisibleFunnelBreakdowns
>['breakdowns'];

export function useVisibleFunnelBreakdowns(
  data: RouterOutputs['chart']['funnel']['current'],
  limit?: number | undefined,
) {
  const max = limit ?? 10;
  const [visibleSeries, setVisibleSeries] = useState<string[]>(
    data?.slice(0, max).map((item) => item.id) ?? [],
  );

  useEffect(() => {
    setVisibleSeries(data?.slice(0, max).map((item) => item.id) ?? []);
  }, [data, max]);

  return useMemo(() => {
    return {
      breakdowns: data
        .map((item, index) => ({
          ...item,
          index,
        }))
        .filter((item) => visibleSeries.includes(item.id)),
      setVisibleSeries,
    } as const;
  }, [visibleSeries, data]);
}

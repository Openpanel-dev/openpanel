import type { IChartData } from '@/trpc/client';
import { getChartColor } from '@/utils/theme';
import { useMemo } from 'react';

export type IRechartPayloadItem = {
  id: string;
  names: string[];
  color: string;
  event: { id?: string; name: string };
  count: number;
  date: string;
  previous?: {
    value: number;
    diff: number | null;
    state: 'positive' | 'negative' | 'neutral';
  };
};

export function useRechartDataModel(series: IChartData['series']) {
  return useMemo(() => {
    return (
      series[0]?.data.map(({ date }) => {
        return {
          date,
          timestamp: new Date(date).getTime(),
          ...series.reduce((acc, serie, idx) => {
            return {
              ...acc,
              ...serie.data.reduce(
                (acc2, item) => {
                  if (item.date === date) {
                    if (item.previous) {
                      acc2[`${serie.id}:prev:count`] = item.previous.value;
                    }
                    acc2[`${serie.id}:count`] = item.count;
                    acc2[`${serie.id}:payload`] = {
                      ...item,
                      id: serie.id,
                      event: serie.event,
                      names: serie.names,
                      color: getChartColor(idx),
                    } satisfies IRechartPayloadItem;
                  }
                  return acc2;
                },
                {} as Record<string, any>,
              ),
            };
          }, {}),
        };
      }) ?? []
    );
  }, [series]);
}

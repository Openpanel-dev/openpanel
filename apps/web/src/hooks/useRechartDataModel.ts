import { useMemo } from 'react';
import type { IChartData, IChartSerieDataItem } from '@/app/_trpc/client';
import { getChartColor } from '@/utils/theme';

export type IRechartPayloadItem = IChartSerieDataItem & { color: string };

export function useRechartDataModel(data: IChartData) {
  return useMemo(() => {
    return (
      data.series[0]?.data.map(({ date }) => {
        return {
          date,
          ...data.series.reduce((acc, serie, idx) => {
            return {
              ...acc,
              ...serie.data.reduce(
                (acc2, item) => {
                  if (item.date === date) {
                    if (item.previous) {
                      acc2[`${idx}:prev:count`] = item.previous.count;
                    }
                    acc2[`${idx}:count`] = item.count;
                    acc2[`${idx}:payload`] = {
                      ...item,
                      color: getChartColor(idx),
                    } satisfies IRechartPayloadItem;
                  }
                  return acc2;
                },
                {} as Record<string, any>
              ),
            };
          }, {}),
        };
      }) ?? []
    );
  }, [data]);
}

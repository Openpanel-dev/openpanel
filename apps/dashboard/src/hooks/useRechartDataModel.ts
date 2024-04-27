'use client';

import { useMemo } from 'react';
import type { IChartData, IChartSerieDataItem } from '@/trpc/client';
import { getChartColor } from '@/utils/theme';

export type IRechartPayloadItem = IChartSerieDataItem & { color: string };

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
  }, [series]);
}

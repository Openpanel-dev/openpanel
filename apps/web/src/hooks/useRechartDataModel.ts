import { useMemo } from 'react';
import type { IChartData } from '@/app/_trpc/client';
import { alphabetIds } from '@/utils/constants';
import { getChartColor } from '@/utils/theme';

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
                    acc2[`${idx}:count`] = item.count;
                    acc2[`${idx}:payload`] = {
                      ...item,
                      color: getChartColor(idx),
                    };
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

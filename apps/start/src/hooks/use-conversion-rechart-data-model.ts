import type { RouterOutputs } from '@/trpc/client';
import { useMemo } from 'react';

export function useConversionRechartDataModel(
  series: RouterOutputs['chart']['conversion']['current'],
) {
  return useMemo(() => {
    if (!series.length || !series[0]?.data.length) {
      return [];
    }

    // Get all unique dates from the first series (all series should have same dates)
    const dates = series[0].data.map((item) => item.date);

    return dates.map((date) => {
      const baseItem = series[0].data.find((item) => item.date === date);
      if (!baseItem) {
        return {
          date,
          timestamp: new Date(date).getTime(),
        };
      }

      // Build data object with all series values
      const dataPoint: Record<string, any> = {
        date,
        timestamp: new Date(date).getTime(),
      };

      series.forEach((serie) => {
        const item = serie.data.find((d) => d.date === date);
        if (item) {
          dataPoint[`${serie.id}:rate`] = item.rate;
          dataPoint[`${serie.id}:previousRate`] = item.previousRate;
          dataPoint[`${serie.id}:total`] = item.total;
          dataPoint[`${serie.id}:conversions`] = item.conversions;
        }
      });

      return dataPoint;
    });
  }, [series]);
}


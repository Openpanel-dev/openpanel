import { useMemo } from 'react';
import type { IChartData } from '@/app/_trpc/client';
import { useVisibleSeries } from '@/hooks/useVisibleSeries';
import { theme } from '@/utils/theme';
import WorldMap from 'react-svg-worldmap';
import AutoSizer from 'react-virtualized-auto-sizer';

import { useChartContext } from './ChartProvider';

interface ReportMapChartProps {
  data: IChartData;
}

export function ReportMapChart({ data }: ReportMapChartProps) {
  const { metric, unit } = useChartContext();
  const { series } = useVisibleSeries(data, 100);

  const mapData = useMemo(
    () =>
      series.map((s) => ({
        country: s.name.toLowerCase(),
        value: s.metrics[metric],
      })),
    [series, metric]
  );

  return (
    <AutoSizer disableHeight>
      {({ width }) => (
        <WorldMap
          size={width}
          data={mapData}
          color={theme.colors['chart-0']}
          borderColor={'#103A96'}
          value-suffix={unit}
        />
      )}
    </AutoSizer>
  );
}

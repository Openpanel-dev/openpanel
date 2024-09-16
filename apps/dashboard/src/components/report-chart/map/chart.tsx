import { useVisibleSeries } from '@/hooks/useVisibleSeries';
import type { IChartData } from '@/trpc/client';
import { theme } from '@/utils/theme';
import { useMemo } from 'react';
import WorldMap from 'react-svg-worldmap';
import AutoSizer from 'react-virtualized-auto-sizer';

import { useReportChartContext } from '../context';

interface Props {
  data: IChartData;
}

export function Chart({ data }: Props) {
  const {
    report: { metric, unit },
  } = useReportChartContext();
  const { series } = useVisibleSeries(data, 100);

  const mapData = useMemo(
    () =>
      series.map((s) => ({
        country: s.names[0]?.toLowerCase() ?? '',
        value: s.metrics[metric],
      })),
    [series, metric],
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

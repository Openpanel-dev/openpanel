import { useVisibleSeries } from '@/hooks/useVisibleSeries';
import type { IChartData } from '@/trpc/client';
import { theme } from '@/utils/theme';
import { useMemo } from 'react';
import WorldMap from 'react-svg-worldmap';
import AutoSizer from 'react-virtualized-auto-sizer';

import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { useEventQueryFilters } from '@/hooks/useEventQueryFilters';
import { useReportChartContext } from '../context';

interface Props {
  data: IChartData;
}

export function Chart({ data }: Props) {
  const {
    report: { metric, unit },
  } = useReportChartContext();
  const { series } = useVisibleSeries(data, 100);
  const [filters, setFilter] = useEventQueryFilters();

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
          onClickFunction={(event) => {
            if (event.countryCode) {
              setFilter('country', event.countryCode);
            }
          }}
          size={width}
          data={mapData}
          color={'var(--chart-0)'}
          borderColor={'hsl(var(--foreground))'}
          value-suffix={unit}
        />
      )}
    </AutoSizer>
  );
}

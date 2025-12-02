import { useVisibleSeries } from '@/hooks/use-visible-series';
import type { IChartData } from '@/trpc/client';
import { useMemo } from 'react';
import WorldMap from 'react-svg-worldmap';
import AutoSizer from 'react-virtualized-auto-sizer';

import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useReportChartContext } from '../context';

interface Props {
  data: IChartData;
}

export function Chart({ data }: Props) {
  const {
    report: { metric, unit },
  } = useReportChartContext();
  const { series } = useVisibleSeries(data, 99999);
  const [_, setFilter] = useEventQueryFilters();
  const mapData = useMemo(
    () =>
      series.map((s) => ({
        country: s.names[1]?.toLowerCase() ?? '',
        value: s.metrics[metric] ?? 0,
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
          borderColor={'var(--foreground)'}
          value-suffix={unit}
        />
      )}
    </AutoSizer>
  );
}

import { useMemo } from 'react';
import WorldMap from 'react-svg-worldmap';
import AutoSizer from 'react-virtualized-auto-sizer';
import { useReportChartContext } from '../context';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useVisibleSeries } from '@/hooks/use-visible-series';
import type { IChartData } from '@/trpc/client';

interface Props {
  data: IChartData;
}

export function Chart({ data }: Props) {
  const {
    report: { metric, unit },
  } = useReportChartContext();
  const { series } = useVisibleSeries(data, { limit: 99_999 });
  const [_, setFilter] = useEventQueryFilters();
  const mapData = useMemo(
    () =>
      series.map((s) => ({
        country: s.names[1]?.toLowerCase() ?? '',
        value: s.metrics[metric] ?? 0,
      })),
    [series, metric]
  );

  return (
    <AutoSizer disableHeight>
      {({ width }) => (
        <WorldMap
          borderColor={'var(--foreground)'}
          color={'var(--chart-0)'}
          data={mapData}
          onClickFunction={(event) => {
            if (event.countryCode) {
              setFilter('country', event.countryCode);
            }
          }}
          size={width}
          value-suffix={unit}
        />
      )}
    </AutoSizer>
  );
}

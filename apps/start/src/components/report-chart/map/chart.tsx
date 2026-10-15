import { useMemo } from 'react';
import WorldMap from 'react-svg-worldmap';
import AutoSizer from 'react-virtualized-auto-sizer';
import { useReportChartContext } from '../context';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useVisibleSeries } from '@/hooks/use-visible-series';
import type { IChartData } from '@/trpc/client';

// The map draws at roughly 2:1, so in a tile its width is capped by the
// height on offer.
const MAP_WIDTH_PER_HEIGHT = 1.9;

interface Props {
  data: IChartData;
}

export function Chart({ data }: Props) {
  const {
    report: { metric, unit },
    layout,
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

  const renderMap = (size: number) => (
    <WorldMap
      borderColor={'var(--foreground)'}
      color={'var(--chart-0)'}
      data={mapData}
      onClickFunction={(event) => {
        if (event.countryCode) {
          setFilter('country', event.countryCode);
        }
      }}
      size={size}
      value-suffix={unit}
    />
  );

  if (layout === 'fill') {
    return (
      <AutoSizer>
        {({ width, height }) => (
          <div
            className="center-center overflow-hidden"
            style={{ width, height }}
          >
            {renderMap(Math.min(width, height * MAP_WIDTH_PER_HEIGHT))}
          </div>
        )}
      </AutoSizer>
    );
  }

  return <AutoSizer disableHeight>{({ width }) => renderMap(width)}</AutoSizer>;
}

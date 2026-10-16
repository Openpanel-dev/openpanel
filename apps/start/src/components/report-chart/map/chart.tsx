import { useEffect, useMemo, useRef } from 'react';
import { useReportChartContext } from '../context';
import { WORLD_COUNTRIES } from './world-geo';
import {
  ChoroplethChart,
  type ChoroplethFeature,
  ChoroplethFeatureComponent,
  ChoroplethTooltip,
  useChoropleth,
} from '@/components/charts/choropleth';
import { useElementSize } from '@/hooks/use-element-size';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useVisibleSeries } from '@/hooks/use-visible-series';
import type { IChartData } from '@/trpc/client';
import { cn } from '@/utils/cn';

const ALL_COUNTRIES = 99_999;
// Mercator world width and visible height per unit of projection scale.
const WORLD_WIDTH_PER_SCALE = 6.3;
const WORLD_HEIGHT_PER_SCALE = 3.6;
// The projection centres on the equator; the map has more land north of it.
const NORTH_SHIFT_PER_SCALE = 0.5;
// The faintest share of the brand colour, so countries with few visitors still read as "some".
const MIN_FILL_SHARE = 15;
const NO_DATA_FILL = 'var(--def-200)';

interface Props {
  data: IChartData;
}

export function Chart({ data }: Props) {
  const {
    report: { metric, unit },
    layout,
  } = useReportChartContext();
  const number = useNumber();
  const { series } = useVisibleSeries(data, { limit: ALL_COUNTRIES });
  const [, setFilter] = useEventQueryFilters();
  const [sizeRef, size] = useElementSize();

  const valueByCountry = useMemo(
    () =>
      new Map(
        series.map((serie) => [
          serie.names[1]?.toUpperCase() ?? '',
          serie.metrics[metric] ?? 0,
        ])
      ),
    [series, metric]
  );
  const maxValue = Math.max(1, ...valueByCountry.values());

  const scale = Math.min(
    size.width / WORLD_WIDTH_PER_SCALE,
    size.height / WORLD_HEIGHT_PER_SCALE
  );
  const countryValue = (feature: ChoroplethFeature) =>
    valueByCountry.get(String(feature.properties?.id ?? '')) ?? 0;
  const countryColor = (feature: ChoroplethFeature) => {
    const value = countryValue(feature);
    if (!value) {
      return NO_DATA_FILL;
    }
    // Square root so a handful of big countries do not wash out the rest.
    const share =
      MIN_FILL_SHARE + (100 - MIN_FILL_SHARE) * Math.sqrt(value / maxValue);
    return `color-mix(in oklab, var(--chart-0) ${Math.round(share)}%, var(--def-100))`;
  };

  return (
    <div
      className={cn('w-full', layout === 'fill' ? 'h-full' : 'aspect-[2]')}
      data-report-chart="map"
      ref={sizeRef}
    >
      {scale > 0 && (
        <ChoroplethChart
          animationDuration={0}
          aspectRatio="auto"
          className="h-full"
          data={WORLD_COUNTRIES}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          scale={scale}
          translate={[
            size.width / 2,
            size.height / 2 + scale * NORTH_SHIFT_PER_SCALE,
          ]}
          zoomEnabled={false}
        >
          <ChoroplethFeatureComponent
            getFeatureColor={countryColor}
            stroke="var(--background)"
            strokeWidth={0.5}
          />
          <ChoroplethTooltip
            formatValue={(value) => number.formatWithUnit(value, unit)}
            getFeatureValue={countryValue}
            valueLabel={series[0]?.names[0]}
          />
          <CountryClick
            onClick={(code) => setFilter('country', code)}
            valueOf={countryValue}
          />
        </ChoroplethChart>
      )}
    </div>
  );
}

/** Clicking a country with data filters the page by it. */
function CountryClick({
  onClick,
  valueOf,
}: {
  onClick: (countryCode: string) => void;
  valueOf: (feature: ChoroplethFeature) => number;
}) {
  const { containerRef, features, hoveredFeatureIndex } = useChoropleth();
  const latest = useRef({ onClick, valueOf, features, hoveredFeatureIndex });
  latest.current = { onClick, valueOf, features, hoveredFeatureIndex };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const handleClick = () => {
      const { features, hoveredFeatureIndex, valueOf, onClick } =
        latest.current;
      const feature =
        hoveredFeatureIndex === null ? null : features[hoveredFeatureIndex];
      if (feature && valueOf(feature) > 0) {
        onClick(String(feature.properties?.id));
      }
    };
    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [containerRef]);

  return null;
}

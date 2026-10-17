import { round } from '@openpanel/shared';
import { useMemo, useState } from 'react';
import { useChartChrome } from '../common/chart-size';
import { getLabelNames } from '../common/label-names';
import { SerieIcon } from '../common/serie-icon';
import { SerieName } from '../common/serie-name';
import { useReportChartContext } from '../context';
import { PieCenter } from '@/components/charts/pie-center';
import { DEFAULT_HOVER_OFFSET, PieChart } from '@/components/charts/pie-chart';
import { PieSlice } from '@/components/charts/pie-slice';
import { useElementSize } from '@/hooks/use-element-size';
import { useNumber } from '@/hooks/use-numer-formatter';
import type { IVisibleSeries } from '@/hooks/use-visible-series';
import { cn } from '@/utils/cn';
import { getChartColor } from '@/utils/theme';

const DONUT_HOLE = 0.6;
const PAD_ANGLE = 0.02;
const CORNER_RADIUS = 4;
// Wider than this (width / height) and the legend goes beside the donut.
const SIDE_LEGEND_RATIO = 1.3;

interface Props {
  series: IVisibleSeries;
}

export function Chart({ series }: Props) {
  const { isEditMode } = useReportChartContext();
  const { legendLimit } = useChartChrome();
  const showLegend = legendLimit > 0;
  const number = useNumber();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [frameRef, frame] = useElementSize();
  const [pieRef, pieBox] = useElementSize();

  const slices = useMemo(() => {
    const total = series.reduce((sum, serie) => sum + serie.metrics.sum, 0);
    const labelNames = getLabelNames(series);
    return series.map((serie) => ({
      id: serie.id,
      names: labelNames(serie.names),
      label: serie.names.join(' › '),
      value: serie.metrics.sum,
      share: total ? round((serie.metrics.sum / total) * 100, 1) : 0,
      color: getChartColor(serie.index),
    }));
  }, [series]);

  const legendSlices = slices.slice(0, legendLimit);
  const hiddenSliceCount = slices.length - legendSlices.length;
  const isSideLegend =
    showLegend && frame.width > frame.height * SIDE_LEGEND_RATIO;
  const pieSize = Math.min(pieBox.width, pieBox.height);
  const innerRadius = Math.max(
    0,
    (pieSize / 2 - DEFAULT_HOVER_OFFSET) * DONUT_HOLE
  );

  return (
    <div className={cn('h-full w-full', isEditMode && 'card p-4')}>
      <div
        className={cn(
          'flex h-full w-full gap-4',
          isSideLegend ? 'flex-row items-center' : 'col'
        )}
        data-report-chart="pie"
        ref={frameRef}
      >
        <div
          className="relative min-h-0 min-w-0 flex-1 self-stretch"
          ref={pieRef}
        >
          {pieSize > 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <PieChart
                cornerRadius={CORNER_RADIUS}
                data={slices}
                hoveredIndex={hoveredIndex}
                innerRadius={innerRadius}
                onHoverChange={setHoveredIndex}
                padAngle={PAD_ANGLE}
                size={pieSize}
              >
                {slices.map((slice, index) => (
                  <PieSlice animate={false} index={index} key={slice.id} />
                ))}
                <PieCenter>
                  {({ value, isHovered }) => {
                    const slice =
                      hoveredIndex === null ? null : slices[hoveredIndex];
                    return (
                      <div className="col max-w-[80%] items-center text-center">
                        <div className="font-mono font-semibold text-lg">
                          {number.short(value)}
                        </div>
                        <div className="w-full truncate text-muted-foreground text-xs">
                          {isHovered && slice ? `${slice.share}%` : 'Total'}
                        </div>
                      </div>
                    );
                  }}
                </PieCenter>
              </PieChart>
            </div>
          )}
        </div>
        {showLegend && (
          <ul
            className={cn(
              'col min-h-0 shrink-0 gap-0.5 overflow-y-auto text-sm',
              isSideLegend ? 'w-1/2 max-w-72' : 'max-h-[40%] w-full'
            )}
          >
            {legendSlices.map((slice, index) => (
              <li key={slice.id}>
                <button
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-opacity',
                    hoveredIndex !== null &&
                      hoveredIndex !== index &&
                      'opacity-50'
                  )}
                  onBlur={() => setHoveredIndex(null)}
                  onFocus={() => setHoveredIndex(index)}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  type="button"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: slice.color }}
                  />
                  <SerieIcon name={slice.names} />
                  <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
                    <SerieName name={slice.names} />
                  </div>
                  <span className="font-mono font-semibold">
                    {number.short(slice.value)}
                  </span>
                  <span className="w-12 text-right font-mono text-muted-foreground">
                    {slice.share}%
                  </span>
                </button>
              </li>
            ))}
            {hiddenSliceCount > 0 && (
              <li className="px-1.5 py-1 text-muted-foreground text-xs">
                +{hiddenSliceCount} more
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

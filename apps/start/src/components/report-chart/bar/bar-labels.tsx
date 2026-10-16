import { NOT_SET_VALUE } from '@openpanel/core/modules/report/report.constants';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { SerieIcon } from '../common/serie-icon';
import { useReportChartContext } from '../context';
import type { BarRow } from './chart';
import { useChart } from '@/components/charts/chart-context';
import { DeltaChip } from '@/components/delta-chip';
import { useNumber } from '@/hooks/use-numer-formatter';
import { cn } from '@/utils/cn';

/**
 * Names (with icons) left of each bar and the value right of it. Drawn in
 * HTML over the chart, like bklit's own axes, because the bar y-axis only
 * renders short plain-text labels.
 */
export function BarLabels({ rowsById }: { rowsById: Map<string, BarRow> }) {
  const { containerRef, barScale, margin, data, hoveredBarIndex } = useChart();
  const number = useNumber();
  const {
    options: { renderSerieName },
  } = useReportChartContext();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const container = containerRef.current;
  if (!(mounted && container && barScale)) {
    return null;
  }
  const bandHeight = barScale.step();
  const bandOffset = (barScale.step() - barScale.bandwidth()) / 2;

  return createPortal(
    <div className="pointer-events-none absolute inset-0">
      {data.map((datum, index) => {
        const row = rowsById.get(String(datum.id));
        if (!row) {
          return null;
        }
        const top = (barScale(row.id) ?? 0) - bandOffset + margin.top;
        const isDimmed = hoveredBarIndex != null && hoveredBarIndex !== index;
        return (
          <div
            className={cn(
              'absolute inset-x-0 flex items-center transition-opacity',
              isDimmed && 'opacity-50'
            )}
            key={row.id}
            style={{ top, height: bandHeight }}
          >
            <div
              className="flex min-w-0 items-center gap-2 pr-3"
              style={{ width: margin.left }}
            >
              <SerieIcon name={row.labelNames} />
              <span
                className="min-w-0 truncate font-medium text-sm"
                title={row.names.join(' › ')}
              >
                {renderSerieName
                  ? renderSerieName(row.labelNames)
                  : row.labelNames
                      .map((name) => name || NOT_SET_VALUE)
                      .join(' › ')}
              </span>
            </div>
            <div
              className="ml-auto flex items-center justify-end gap-1.5 pl-2"
              style={{ width: margin.right }}
            >
              <span className="font-mono font-semibold text-sm">
                {number.short(row.count)}
              </span>
              {row.previousDiff?.diff != null && (
                <DeltaChip
                  size="sm"
                  variant={
                    row.previousDiff.state === 'positive' ? 'inc' : 'dec'
                  }
                >
                  {row.previousDiff.diff.toFixed(0)}%
                </DeltaChip>
              )}
            </div>
          </div>
        );
      })}
    </div>,
    container
  );
}

import type { ReactNode } from 'react';
import { AspectContainer } from '../aspect-container';
import { useReportChartContext } from '../context';

/**
 * Where a report's pieces go: a dashboard tile is the chart alone; the editor
 * and the share page get the summary, the chart, and the tables under it.
 */
export function ChartWithTable({
  summary,
  chart,
  tables,
  sizesItself = false,
}: {
  summary?: ReactNode;
  chart: ReactNode;
  tables: ReactNode;
  /** The chart measures its own height (bar, sankey) instead of the aspect box. */
  sizesItself?: boolean;
}) {
  const { layout } = useReportChartContext();
  const sizedChart = sizesItself ? (
    chart
  ) : (
    <AspectContainer>{chart}</AspectContainer>
  );

  if (layout === 'fill') {
    return sizedChart;
  }

  return (
    <div className="col gap-4">
      {summary}
      {sizedChart}
      {tables}
    </div>
  );
}

/** A table's frame under the chart. */
export function TableCard({
  title,
  children,
}: {
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      {title && <div className="border-b px-4 py-3 font-medium">{title}</div>}
      {children}
    </div>
  );
}

import type { IChartType } from '@openpanel/core/modules/report/report.constants';
import {
  AreaChartIcon,
  BarChart3Icon,
  BarChartHorizontalIcon,
  ChartScatterIcon,
  ConeIcon,
  GitBranchIcon,
  Globe2Icon,
  HashIcon,
  LineChartIcon,
  type LucideIcon,
  PieChartIcon,
  TrendingUpIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { GRID_COLUMNS, type LayoutSource, toLayout } from './dashboard-grid';
import { cn } from '@/utils/cn';

export const CHART_TYPE_ICONS: Record<IChartType, LucideIcon> = {
  bar: BarChartHorizontalIcon,
  linear: LineChartIcon,
  pie: PieChartIcon,
  metric: HashIcon,
  map: Globe2Icon,
  histogram: BarChart3Icon,
  funnel: ConeIcon,
  area: AreaChartIcon,
  retention: ChartScatterIcon,
  conversion: TrendingUpIcon,
  sankey: GitBranchIcon,
};

// Shown rows: a short dashboard still looks like a dashboard, a long one is cut
// rather than shrunk to specks.
const MIN_ROWS = 6;
const MAX_ROWS = 14;
// A tile shows its chart icon only when it is big enough to hold one.
const ICON_MIN_WIDTH_COLUMNS = 3;
const ICON_MIN_HEIGHT_ROWS = 2;
const ICON_SIZE = 14;

function iconFor(chartType: IChartType | undefined) {
  return chartType ? CHART_TYPE_ICONS[chartType] : undefined;
}

/** A dashboard's saved layout in miniature: one block per report, with its chart's icon. */
export function DashboardPreview({
  reports,
  className,
}: {
  reports: (LayoutSource & { chartType: IChartType })[];
  className?: string;
}) {
  const tiles = useMemo(() => {
    const layout = toLayout(reports);
    const byId = new Map(reports.map((report) => [report.id, report]));
    const rows = Math.min(
      MAX_ROWS,
      Math.max(MIN_ROWS, ...layout.map((item) => item.y + item.h))
    );
    return layout
      .filter((item) => item.y < rows)
      .map((item) => ({
        id: item.i,
        icon: iconFor(byId.get(item.i)?.chartType),
        showIcon:
          item.w >= ICON_MIN_WIDTH_COLUMNS && item.h >= ICON_MIN_HEIGHT_ROWS,
        style: {
          left: `${(item.x / GRID_COLUMNS) * 100}%`,
          top: `${(item.y / rows) * 100}%`,
          width: `${(item.w / GRID_COLUMNS) * 100}%`,
          height: `${(Math.min(item.h, rows - item.y) / rows) * 100}%`,
        },
      }));
  }, [reports]);

  return (
    <div
      className={cn(
        'relative aspect-[2/1] w-full overflow-hidden rounded-md bg-def-100 p-1.5',
        className
      )}
    >
      <div className="relative h-full w-full">
        {tiles.map((tile) => (
          <div className="absolute p-0.5" key={tile.id} style={tile.style}>
            <div className="flex h-full w-full items-center justify-center rounded-[3px] bg-def-300/70 text-muted-foreground transition-colors group-hover:bg-chart-0/20 group-hover:text-chart-0 dark:bg-def-700/70">
              {tile.icon && tile.showIcon && <tile.icon size={ICON_SIZE} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

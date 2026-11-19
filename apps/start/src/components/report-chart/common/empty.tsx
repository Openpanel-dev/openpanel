import { ChartLineIcon, ChartNoAxesColumnIcon } from 'lucide-react';
import { useReportChartContext } from '../context';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/utils/cn';

export function ReportChartEmpty({
  title = 'No data',
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  const {
    isEditMode,
    report: { series },
  } = useReportChartContext();
  const hasSeries = series && series.length > 0;

  if (!hasSeries) {
    return (
      <EmptyState
        className="card h-full w-full"
        description="Pick at least one event and the chart draws itself here."
        icon={ChartLineIcon}
        title="Ready when you are"
        variant="inline"
      />
    );
  }

  return (
    <EmptyState
      className={cn('h-full w-full', isEditMode && 'card')}
      description={children}
      icon={ChartNoAxesColumnIcon}
      title={title}
      variant="inline"
    />
  );
}

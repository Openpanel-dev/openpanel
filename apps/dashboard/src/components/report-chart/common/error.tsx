import { cn } from '@/utils/cn';
import { ServerCrashIcon } from 'lucide-react';
import { useReportChartContext } from '../context';

export function ReportChartError() {
  const { isEditMode } = useReportChartContext();
  return (
    <div
      className={cn(
        'center-center h-full w-full flex-col',
        isEditMode && 'card p-4',
      )}
    >
      <ServerCrashIcon
        strokeWidth={1.2}
        className="mb-4 size-10 animate-pulse text-muted-foreground"
      />
      <div className="text-sm font-medium text-muted-foreground">
        There was an error loading this chart.
      </div>
    </div>
  );
}

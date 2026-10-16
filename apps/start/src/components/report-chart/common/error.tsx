import { ServerCrashIcon } from 'lucide-react';
import { useReportChartContext } from '../context';
import { cn } from '@/utils/cn';

export function ReportChartError() {
  const { isEditMode } = useReportChartContext();
  return (
    <div
      className={cn(
        'center-center h-full w-full flex-col',
        isEditMode && 'card p-4'
      )}
    >
      <ServerCrashIcon
        className="mb-4 size-10 animate-pulse text-muted-foreground"
        strokeWidth={1.2}
      />
      <div className="font-medium text-muted-foreground text-sm">
        There was an error loading this chart.
      </div>
    </div>
  );
}

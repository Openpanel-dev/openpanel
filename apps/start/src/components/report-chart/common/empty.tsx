import { BirdIcon, CornerLeftUpIcon, ForkliftIcon } from 'lucide-react';
import { useReportChartContext } from '../context';
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

  if (!series || series.length === 0) {
    return (
      <div className="card center-center relative h-full w-full flex-col p-4">
        <div className="row absolute top-4 left-4 items-end gap-2">
          <CornerLeftUpIcon
            className="size-8 animate-pulse text-muted-foreground"
            strokeWidth={1.2}
          />
          <div className="text-muted-foreground">Start here</div>
        </div>
        <ForkliftIcon
          className="mb-4 size-1/3 max-w-40 animate-pulse text-muted-foreground"
          strokeWidth={1.2}
        />
        <div className="font-medium text-muted-foreground">
          Ready when you're
        </div>
        <div className="mt-2 text-muted-foreground">
          Pick at least one event to start visualising
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'center-center h-full w-full flex-col',
        isEditMode && 'card p-4'
      )}
    >
      <BirdIcon
        className="mb-4 size-1/3 animate-pulse text-muted-foreground"
        strokeWidth={1.2}
      />
      <div className="font-medium text-muted-foreground">{title}</div>
      <div className="mt-2 text-muted-foreground">{children}</div>
    </div>
  );
}

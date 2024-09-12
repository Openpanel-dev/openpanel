import { ServerCrashIcon } from 'lucide-react';

export function ReportChartError() {
  return (
    <div className="center-center h-full w-full flex-col">
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

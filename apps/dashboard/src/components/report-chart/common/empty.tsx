import { BirdIcon } from 'lucide-react';

export function ReportChartEmpty() {
  return (
    <div className="center-center h-full w-full flex-col">
      <BirdIcon
        strokeWidth={1.2}
        className="mb-4 size-10 animate-pulse text-muted-foreground"
      />
      <div className="text-sm font-medium text-muted-foreground">No data</div>
    </div>
  );
}

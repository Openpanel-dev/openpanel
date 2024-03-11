import { cn } from '@/utils/cn';

interface ChartLoadingProps {
  className?: string;
}
export function ChartLoading({ className }: ChartLoadingProps) {
  return (
    <div
      className={cn(
        'aspect-video w-full bg-slate-200 animate-pulse rounded max-h-[300px] min-h-[200px]',
        className
      )}
    />
  );
}

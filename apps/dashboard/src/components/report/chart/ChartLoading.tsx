import { cn } from '@/utils/cn';

interface ChartLoadingProps {
  className?: string;
}
export function ChartLoading({ className }: ChartLoadingProps) {
  return (
    <div
      className={cn(
        'aspect-video max-h-[300px] min-h-[200px] w-full animate-pulse rounded bg-slate-200',
        className
      )}
    />
  );
}

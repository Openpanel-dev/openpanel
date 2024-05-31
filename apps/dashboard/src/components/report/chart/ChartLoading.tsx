import { cn } from '@/utils/cn';

interface ChartLoadingProps {
  className?: string;
}
export function ChartLoading({ className }: ChartLoadingProps) {
  return (
    <div
      className={cn(
        'bg-def-200 aspect-video max-h-[300px] min-h-[200px] w-full animate-pulse rounded',
        className
      )}
    />
  );
}

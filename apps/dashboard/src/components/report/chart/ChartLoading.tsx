import { cn } from '@/utils/cn';

import { ResponsiveContainer } from './ResponsiveContainer';

interface ChartLoadingProps {
  className?: string;
  aspectRatio?: number;
}
export function ChartLoading({ className, aspectRatio }: ChartLoadingProps) {
  return (
    <ResponsiveContainer aspectRatio={aspectRatio}>
      <div
        className={cn(
          'h-full w-full animate-pulse rounded bg-def-200',
          className
        )}
      />
    </ResponsiveContainer>
  );
}

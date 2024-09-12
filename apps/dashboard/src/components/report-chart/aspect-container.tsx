'use client';

import { cn } from '@/utils/cn';

import { DEFAULT_ASPECT_RATIO } from '@openpanel/constants';

import { useReportChartContext } from './context';

interface AspectContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function AspectContainer({ children, className }: AspectContainerProps) {
  const { options } = useReportChartContext();
  const minHeight = options?.minHeight ?? 100;
  const maxHeight = options?.maxHeight ?? 300;
  const aspectRatio = options?.aspectRatio ?? DEFAULT_ASPECT_RATIO;

  return (
    <div
      className={cn('w-full', className)}
      style={{
        aspectRatio: 1 / aspectRatio,
        maxHeight,
        minHeight,
      }}
    >
      {children}
    </div>
  );
}

import { DEFAULT_ASPECT_RATIO } from '@openpanel/core/modules/report/report.constants';
import { useReportChartContext } from './context';
import { cn } from '@/utils/cn';

interface AspectContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function AspectContainer({ children, className }: AspectContainerProps) {
  const { options, layout } = useReportChartContext();
  if (layout === 'fill') {
    return (
      <div className={cn('h-full min-h-0 w-full', className)}>{children}</div>
    );
  }
  const minHeight = options?.minHeight ?? 100;
  const maxHeight = options?.maxHeight ?? 300;
  const aspectRatio = options?.aspectRatio ?? DEFAULT_ASPECT_RATIO;

  // Safari does not resolve a child's `height: 100%` against a height that
  // comes from `aspect-ratio`, so the chart grew past the box and over the
  // table below. An absolute layer gives children a definite height.
  return (
    <div
      className={cn('relative w-full', className)}
      style={{
        aspectRatio: 1 / aspectRatio,
        maxHeight,
        minHeight,
      }}
    >
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}

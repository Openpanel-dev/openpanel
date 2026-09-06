import { DEFAULT_ASPECT_RATIO } from '@openpanel/core/modules/report/report.constants';
import { useReportChartContext } from './context';
import { cn } from '@/utils/cn';

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

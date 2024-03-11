import type { HtmlProps } from '@/types';
import { cn } from '@/utils/cn';

import { useChartContext } from './report/chart/ChartProvider';

type ColorSquareProps = HtmlProps<HTMLDivElement>;

export function ColorSquare({ children, className }: ColorSquareProps) {
  const { hideID } = useChartContext();
  if (hideID) {
    return null;
  }
  return (
    <div
      className={cn(
        'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-purple-500 text-xs font-medium text-white [.mini_&]:h-4 [.mini_&]:w-4 [.mini_&]:text-[0.6rem]',
        className
      )}
    >
      {children}
    </div>
  );
}

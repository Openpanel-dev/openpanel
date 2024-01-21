import { useNumber } from '@/hooks/useNumerFormatter';
import { cn } from '@/utils/cn';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { useChartContext } from './chart/ChartProvider';

interface PreviousDiffIndicatorProps {
  diff?: number | null | undefined;
  state?: string | null | undefined;
  children?: React.ReactNode;
}

export function PreviousDiffIndicator({
  diff,
  state,
  children,
}: PreviousDiffIndicatorProps) {
  const { previous } = useChartContext();
  const number = useNumber();
  if (
    (children === undefined && (diff === null || diff === undefined)) ||
    previous === false
  ) {
    return null;
  }

  return (
    <>
      <div
        className={cn('flex items-center', [
          state === 'positive' && 'text-emerald-500',
          state === 'negative' && 'text-rose-500',
          state === 'neutral' && 'text-slate-400',
        ])}
      >
        {state === 'positive' && <ChevronUp size={20} />}
        {state === 'negative' && <ChevronDown size={20} />}
        {number.format(diff)}%
      </div>
      {children}
    </>
  );
}

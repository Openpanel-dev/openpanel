import { useNumber } from '@/hooks/useNumerFormatter';
import { cn } from '@/utils/cn';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';

import { useReportChartContext } from '../context';

export function getDiffIndicator<A, B, C>(
  inverted: boolean | undefined,
  state: string | undefined | null,
  positive: A,
  negative: B,
  neutral: C
): A | B | C {
  if (state === 'neutral' || !state) {
    return neutral;
  }

  if (inverted === true) {
    return state === 'positive' ? negative : positive;
  }
  return state === 'positive' ? positive : negative;
}

// TODO: Fix this mess!

interface PreviousDiffIndicatorProps {
  diff?: number | null | undefined;
  state?: string | null | undefined;
  children?: React.ReactNode;
  inverted?: boolean;
  className?: string;
  size?: 'sm' | 'lg';
}

export function PreviousDiffIndicator({
  diff,
  state,
  inverted,
  size = 'sm',
  children,
  className,
}: PreviousDiffIndicatorProps) {
  const {
    report: { previousIndicatorInverted, previous },
  } = useReportChartContext();
  const variant = getDiffIndicator(
    inverted ?? previousIndicatorInverted,
    state,
    'bg-emerald-300',
    'bg-rose-300',
    undefined
  );
  const number = useNumber();

  if (diff === null || diff === undefined || previous === false) {
    return children ?? null;
  }

  const renderIcon = () => {
    if (state === 'positive') {
      return <ArrowUpIcon strokeWidth={3} size={10} color="#000" />;
    }
    if (state === 'negative') {
      return <ArrowDownIcon strokeWidth={3} size={10} color="#000" />;
    }
    return null;
  };

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-1 font-mono font-medium',
          size === 'lg' && 'gap-2',
          className
        )}
      >
        <div
          className={cn(
            `flex size-4 items-center justify-center rounded-full`,
            variant,
            size === 'lg' && 'size-8'
          )}
        >
          {renderIcon()}
        </div>
        {number.format(diff)}%
      </div>
      {children}
    </>
  );
}

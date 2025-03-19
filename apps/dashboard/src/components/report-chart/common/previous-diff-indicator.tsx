import { useNumber } from '@/hooks/useNumerFormatter';
import { cn } from '@/utils/cn';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';

import { useReportChartContext } from '../context';

export function getDiffIndicator<A, B, C>(
  inverted: boolean | undefined,
  state: string | undefined | null,
  positive: A,
  negative: B,
  neutral: C,
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
  size?: 'sm' | 'lg' | 'md';
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
    undefined,
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
          className,
        )}
      >
        <div
          className={cn(
            'flex size-4 items-center justify-center rounded-full',
            variant,
            size === 'lg' && 'size-8',
            size === 'md' && 'size-6',
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

interface PreviousDiffIndicatorPureProps {
  diff?: number | null | undefined;
  state?: string | null | undefined;
  inverted?: boolean;
  size?: 'sm' | 'lg' | 'md';
  className?: string;
  showPrevious?: boolean;
}

export function PreviousDiffIndicatorPure({
  diff,
  state,
  inverted,
  size = 'sm',
  className,
  showPrevious = true,
}: PreviousDiffIndicatorPureProps) {
  const variant = getDiffIndicator(
    inverted,
    state,
    'bg-emerald-300',
    'bg-rose-300',
    undefined,
  );

  if (diff === null || diff === undefined || !showPrevious) {
    return null;
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
    <div
      className={cn(
        'flex items-center gap-1 font-mono font-medium',
        size === 'lg' && 'gap-2',
        className,
      )}
    >
      <div
        className={cn(
          'flex size-2.5 items-center justify-center rounded-full',
          variant,
          size === 'lg' && 'size-8',
          size === 'md' && 'size-6',
        )}
      >
        {renderIcon()}
      </div>
      {diff.toFixed(1)}%
    </div>
  );
}

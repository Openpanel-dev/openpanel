import { useNumber } from '@/hooks/useNumerFormatter';
import { cn } from '@/utils/cn';
import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react';

import { Badge } from '../ui/badge';
import { useChartContext } from './chart/ChartProvider';

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
}

export function PreviousDiffIndicator({
  diff,
  state,
  children,
}: PreviousDiffIndicatorProps) {
  const { previous, previousIndicatorInverted } = useChartContext();
  const variant = getDiffIndicator(
    previousIndicatorInverted,
    state,
    'success',
    'destructive',
    undefined
  );
  const number = useNumber();

  if (diff === null || diff === undefined || previous === false) {
    return children ?? null;
  }

  const renderIcon = () => {
    if (state === 'positive') {
      return <TrendingUpIcon size={15} />;
    }
    if (state === 'negative') {
      return <TrendingDownIcon size={15} />;
    }
    return null;
  };

  return (
    <>
      <Badge className="flex gap-1" variant={variant}>
        {renderIcon()}
        {number.format(diff)}%
      </Badge>
      {children}
    </>
  );
}

export function PreviousDiffIndicatorText({
  diff,
  state,
  className,
}: PreviousDiffIndicatorProps & { className?: string }) {
  const { previous, previousIndicatorInverted } = useChartContext();
  const number = useNumber();
  if (diff === null || diff === undefined || previous === false) {
    return null;
  }

  const renderIcon = () => {
    if (state === 'positive') {
      return <TrendingUpIcon size={15} />;
    }
    if (state === 'negative') {
      return <TrendingDownIcon size={15} />;
    }
    return null;
  };

  return (
    <div
      className={cn([
        'flex gap-0.5 items-center',
        getDiffIndicator(
          previousIndicatorInverted,
          state,
          'text-emerald-600',
          'text-red-600',
          undefined
        ),
        className,
      ])}
    >
      {renderIcon()}
      {number.short(diff)}%
    </div>
  );
}

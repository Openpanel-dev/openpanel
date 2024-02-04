import { useNumber } from '@/hooks/useNumerFormatter';
import { cn } from '@/utils/cn';
import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react';

import { Badge } from '../ui/badge';
import { useChartContext } from './chart/ChartProvider';

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
  const number = useNumber();
  if (diff === null || diff === undefined || previous === false) {
    return children ?? null;
  }

  if (previousIndicatorInverted === true) {
    return (
      <>
        <Badge
          className="flex gap-1"
          variant={state === 'positive' ? 'destructive' : 'success'}
        >
          {state === 'negative' && <TrendingUpIcon size={15} />}
          {state === 'positive' && <TrendingDownIcon size={15} />}
          {number.format(diff)}%
        </Badge>
        {children}
      </>
    );
  }

  return (
    <>
      <Badge
        className="flex gap-1"
        variant={state === 'positive' ? 'success' : 'destructive'}
      >
        {state === 'positive' && <TrendingUpIcon size={15} />}
        {state === 'negative' && <TrendingDownIcon size={15} />}
        {number.format(diff)}%
      </Badge>
      {children}
    </>
  );
}

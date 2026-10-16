'use client';

import { useLegendItem } from './legend-context';
import { cn } from '@/lib/utils';

export interface LegendLabelProps {
  /** Label class name. Default: "text-sm font-medium" */
  className?: string;
}

export function LegendLabel({
  className = 'text-sm font-medium',
}: LegendLabelProps) {
  const { item } = useLegendItem();

  return (
    <span className={cn('text-legend-foreground', className)}>
      {item.label}
    </span>
  );
}

LegendLabel.displayName = 'LegendLabel';

'use client';

import { cn } from '@/utils/cn';

import type { WidgetHeadProps } from '../Widget';
import { WidgetHead as WidgetHeadBase } from '../Widget';

export function WidgetHead({ className, ...props }: WidgetHeadProps) {
  return (
    <WidgetHeadBase
      className={cn('flex items-center justify-between', className)}
      {...props}
    />
  );
}

export function WidgetButtons({ className, ...props }: WidgetHeadProps) {
  return (
    <div
      className={cn(
        'flex gap-2 [&_button]:text-xs [&_button]:opacity-50 [&_button.active]:opacity-100',
        className
      )}
      {...props}
    />
  );
}

import { round } from '@openpanel/shared';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import * as React from 'react';
import { cn } from '@/utils/cn';

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    size?: 'sm' | 'default' | 'lg';
    innerClassName?: string;
  }
>(({ className, innerClassName, value, size = 'default', ...props }, ref) => (
  <ProgressPrimitive.Root
    className={cn(
      'relative h-4 w-full min-w-16 overflow-hidden rounded bg-def-200 shadow-sm',
      size === 'sm' && 'h-2',
      size === 'lg' && 'h-5',
      className
    )}
    ref={ref}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn(
        'h-full w-full flex-1 rounded bg-primary transition-all',
        innerClassName
      )}
      style={{
        transform: `translateX(-${100 - (value || 0)}%)`,
      }}
    />
    {value && size !== 'sm' && (
      <div className="absolute top-0 bottom-0 z-5 flex items-center px-2 font-medium font-mono text-sm">
        <div>{round(value, 2)}%</div>
      </div>
    )}
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };

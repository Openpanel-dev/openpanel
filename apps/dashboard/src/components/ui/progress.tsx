import { cn } from '@/utils/cn';
import { round } from '@/utils/math';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import * as React from 'react';

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    color: string;
    size?: 'sm' | 'default' | 'lg';
  }
>(({ className, value, color, size = 'default', ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    className={cn(
      'relative h-4 w-full min-w-16 overflow-hidden rounded bg-def-200 shadow-sm',
      size === 'sm' && 'h-2',
      size === 'lg' && 'h-8',
      className,
    )}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={'h-full w-full flex-1 rounded bg-primary transition-all'}
      style={{
        transform: `translateX(-${100 - (value || 0)}%)`,
        background: color,
      }}
    />
    {value && size !== 'sm' && (
      <div className="z-5 absolute bottom-0 top-0 flex items-center px-2 text-sm font-semibold">
        <div>{round(value, 2)}%</div>
      </div>
    )}
  </ProgressPrimitive.Root>
));
Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };

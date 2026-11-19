import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const VirtualScrollArea = React.forwardRef<
  HTMLDivElement,
  {
    children: React.ReactNode;
    className?: string;
  }
>(({ children, className }, ref) => {
  // The ref MUST point directly to the scrollable element
  // This element MUST have:
  // 1. overflow-y-auto (or overflow: auto)
  // 2. A constrained height (via flex-1 min-h-0 or fixed height)
  return (
    <div
      className={cn('w-full overflow-y-auto', className)}
      ref={ref}
      style={{
        // Ensure height is constrained by flex parent
        height: '100%',
        maxHeight: '100%',
      }}
    >
      {children}
    </div>
  );
});

VirtualScrollArea.displayName = 'VirtualScrollArea';

function ScrollArea({
  className,
  children,
  ref,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  orientation?: 'vertical' | 'horizontal';
}) {
  return (
    <ScrollAreaPrimitive.Root
      className={cn('relative', className)}
      data-slot="scroll-area"
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        className="[&>div]:!block size-full rounded-[inherit] outline-none transition-[color,box-shadow] focus-visible:outline-1 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        data-slot="scroll-area-viewport"
        ref={ref}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar orientation={orientation} />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      className={cn(
        'flex touch-none select-none p-px transition-colors',
        orientation === 'vertical' &&
          'h-full w-2.5 border-l border-l-transparent',
        orientation === 'horizontal' &&
          'h-2.5 flex-col border-t border-t-transparent',
        className
      )}
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        className="relative flex-1 rounded-full bg-border"
        data-slot="scroll-area-thumb"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };

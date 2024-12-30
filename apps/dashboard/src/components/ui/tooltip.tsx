'use client';

import { cn } from '@/utils/cn';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;
const TooltipPortal = TooltipPrimitive.Portal;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
    disabled?: boolean;
  }
>(({ className, sideOffset = 4, disabled, ...props }, ref) =>
  disabled ? null : (
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 rounded-md border bg-background p-4 py-2.5 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  ),
);
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };

interface TooltiperProps {
  asChild?: boolean;
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  tooltipClassName?: string;
  onClick?: () => void;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  delayDuration?: number;
  sideOffset?: number;
  disabled?: boolean;
}
export function Tooltiper({
  asChild,
  content,
  children,
  className,
  tooltipClassName,
  onClick,
  side,
  delayDuration = 0,
  sideOffset = 10,
  disabled = false,
  align,
}: TooltiperProps) {
  if (disabled) return children;
  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger
        asChild={asChild}
        className={className}
        onClick={onClick}
        type="button"
      >
        {children}
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          sideOffset={sideOffset}
          side={side}
          className={tooltipClassName}
          align={align}
        >
          {content}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

'use client';

import * as SliderPrimitive from '@radix-ui/react-slider';
import * as React from 'react';

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

const Slider = (
  {
    ref,
    className,
    tooltip,
    ...props
  }
) => (<SliderPrimitive.Root
  ref={ref}
  className={cn(
    'relative flex w-full touch-none select-none items-center',
    className,
  )}
  {...props}
>
  <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-white/10">
    <SliderPrimitive.Range className="absolute h-full bg-white/90" />
  </SliderPrimitive.Track>
  {tooltip ? (
    <Tooltip open disableHoverableContent>
      <TooltipTrigger asChild>
        <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-white bg-black ring-offset-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={10}
        className="rounded-full bg-black text-white/70 py-1 text-xs border-white/30"
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  ) : (
    <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-white bg-black ring-offset-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
  )}
</SliderPrimitive.Root>);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };

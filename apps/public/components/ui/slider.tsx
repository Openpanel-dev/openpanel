'use client';

import * as SliderPrimitive from '@radix-ui/react-slider';
import * as React from 'react';

import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';

function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(false);
  React.useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
  }, [query]);
  return matches;
}

const Slider = ({
  ref,
  className,
  tooltip,
  ...props
}: {
  ref?: any;
  className?: string;
  tooltip?: string;
  value: number[];
  max: number;
  step: number;
  onValueChange: (value: number[]) => void;
}) => {
  const isMobile = useMediaQuery('(max-width: 768px)');
  return (
    <>
      {isMobile && (
        <div className="text-sm text-muted-foreground mb-4">{tooltip}</div>
      )}
      <SliderPrimitive.Root
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
        {tooltip && !isMobile ? (
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
      </SliderPrimitive.Root>
    </>
  );
};
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };

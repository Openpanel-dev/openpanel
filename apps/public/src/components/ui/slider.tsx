import * as SliderPrimitive from '@radix-ui/react-slider';
import * as React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { cn } from '@/lib/utils';

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
        <div className="mb-4 text-muted-foreground text-sm">{tooltip}</div>
      )}
      <SliderPrimitive.Root
        className={cn(
          'relative flex w-full touch-none select-none items-center',
          className
        )}
        ref={ref}
        {...props}
      >
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-white/10">
          <SliderPrimitive.Range className="absolute h-full bg-white/90" />
        </SliderPrimitive.Track>
        {tooltip && !isMobile ? (
          <Tooltip disableHoverableContent open>
            <TooltipTrigger asChild>
              <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-white bg-black ring-offset-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50" />
            </TooltipTrigger>
            <TooltipContent
              className="rounded-full border-white/30 bg-black py-1 text-white/70 text-xs"
              side="top"
              sideOffset={10}
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

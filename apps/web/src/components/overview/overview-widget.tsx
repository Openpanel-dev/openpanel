'use client';

import { Children, useEffect, useRef, useState } from 'react';
import { useThrottle } from '@/hooks/useThrottle';
import { cn } from '@/utils/cn';
import { ChevronsUpDownIcon } from 'lucide-react';
import { last } from 'ramda';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { WidgetHeadProps } from '../Widget';
import { WidgetHead as WidgetHeadBase } from '../Widget';

export function WidgetHead({ className, ...props }: WidgetHeadProps) {
  return (
    <WidgetHeadBase
      className={cn(
        'flex flex-col p-0 [&_.title]:text-sm [&_.title]:px-4 [&_.title]:py-2',
        className
      )}
      {...props}
    />
  );
}

export function WidgetButtons({
  className,
  children,
  ...props
}: WidgetHeadProps) {
  const container = useRef<HTMLDivElement>(null);
  const sizes = useRef<number[]>([]);
  const [slice, setSlice] = useState(3); // Show 3 buttons by default
  const gap = 16;

  const handleResize = useThrottle(() => {
    if (container.current) {
      if (sizes.current.length === 0) {
        // Get buttons
        const buttons: HTMLButtonElement[] = Array.from(
          container.current.querySelectorAll(`button`)
        );
        // Get sizes and cache them
        sizes.current = buttons.map(
          (button) => Math.ceil(button.offsetWidth) + gap
        );
      }
      const containerWidth = container.current.offsetWidth;
      const buttonsWidth = sizes.current.reduce((acc, size) => acc + size, 0);
      const moreWidth = (last(sizes.current) ?? 0) + gap;

      if (buttonsWidth > containerWidth) {
        const res = sizes.current.reduce(
          (acc, size, index) => {
            if (acc.size + size + moreWidth > containerWidth) {
              return { index: acc.index, size: acc.size + size };
            }
            return { index, size: acc.size + size };
          },
          { index: 0, size: 0 }
        );

        setSlice(res.index);
      } else {
        setSlice(sizes.current.length - 1);
      }
    }
  }, 30);

  useEffect(() => {
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize, children]);

  const hidden = '!opacity-0 absolute pointer-events-none';

  return (
    <div
      ref={container}
      className={cn(
        'px-4 self-stretch justify-start transition-opacity flex flex-wrap [&_button]:text-xs [&_button]:opacity-50 [&_button]:whitespace-nowrap [&_button.active]:opacity-100 [&_button.active]:border-b [&_button.active]:border-black [&_button]:py-1',
        className
      )}
      style={{ gap }}
      {...props}
    >
      {Children.map(children, (child, index) => {
        return (
          <div className={cn('flex', slice < index ? hidden : 'opacity-100')}>
            {child}
          </div>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'flex items-center gap-1 select-none',
              sizes.current.length - 1 === slice ? hidden : 'opacity-50'
            )}
          >
            More <ChevronsUpDownIcon size={12} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="[&_button]:w-full">
          <DropdownMenuGroup>
            {Children.map(children, (child, index) => {
              if (index <= slice) {
                return null;
              }
              return <DropdownMenuItem asChild>{child}</DropdownMenuItem>;
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

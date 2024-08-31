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
import type { WidgetHeadProps } from '../widget';
import { WidgetHead as WidgetHeadBase } from '../widget';

export function WidgetHead({ className, ...props }: WidgetHeadProps) {
  return (
    <WidgetHeadBase
      className={cn(
        'flex flex-col rounded-t-xl p-0 [&_.title]:flex [&_.title]:items-center [&_.title]:justify-between [&_.title]:p-4 [&_.title]:font-semibold',
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
        '-mb-px -mt-2 flex flex-wrap justify-start self-stretch px-4 transition-opacity [&_button.active]:border-b-2 [&_button.active]:border-black [&_button.active]:opacity-100 dark:[&_button.active]:border-white [&_button]:whitespace-nowrap [&_button]:py-1 [&_button]:text-sm [&_button]:opacity-50',
        className
      )}
      style={{ gap }}
      {...props}
    >
      {Children.map(children, (child, index) => {
        return (
          <div
            className={cn(
              'flex [&_button]:leading-normal',
              slice < index ? hidden : 'opacity-100'
            )}
          >
            {child}
          </div>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'flex select-none items-center gap-1',
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

export function WidgetFooter({
  className,
  children,
  ...props
}: WidgetHeadProps) {
  return (
    <div
      className={cn(
        'flex rounded-b-md border-t bg-def-100 p-2  py-1',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

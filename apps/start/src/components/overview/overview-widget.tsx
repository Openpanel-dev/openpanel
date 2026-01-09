import { useThrottle } from '@/hooks/use-throttle';
import { cn } from '@/utils/cn';
import { ChevronsUpDownIcon, type LucideIcon, SearchIcon } from 'lucide-react';
import { last } from 'ramda';
import { Children, useCallback, useEffect, useRef, useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import type { WidgetHeadProps, WidgetTitleProps } from '../widget';
import { WidgetHead as WidgetHeadBase } from '../widget';

export function WidgetHead({ className, ...props }: WidgetHeadProps) {
  return (
    <WidgetHeadBase
      className={cn(
        'relative flex flex-col rounded-t-xl p-0 [&_.title]:flex [&_.title]:items-center [&_.title]:p-4 [&_.title]:font-semibold',
        className,
      )}
      {...props}
    />
  );
}

export function WidgetTitle({
  children,
  className,
  icon: Icon,
  ...props
}: WidgetTitleProps & {
  icon?: LucideIcon;
}) {
  return (
    <div
      className={cn('title text-left row justify-start', className)}
      {...props}
    >
      {Icon && (
        <div className="rounded-lg bg-def-200 p-1 mr-2">
          <Icon size={16} />
        </div>
      )}
      {children}
    </div>
  );
}

export function WidgetAbsoluteButtons({
  className,
  children,
  ...props
}: WidgetHeadProps) {
  return (
    <div
      className={cn(
        'row gap-1 absolute right-4 top-1/2 -translate-y-1/2',
        className,
      )}
      {...props}
    >
      {children}
    </div>
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
          container.current.querySelectorAll('button'),
        );
        // Get sizes and cache them
        sizes.current = buttons.map(
          (button) => Math.ceil(button.offsetWidth) + gap,
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
          { index: 0, size: 0 },
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
        className,
      )}
      style={{ gap }}
      {...props}
    >
      {Children.map(children, (child, index) => {
        return (
          <div
            className={cn(
              'flex [&_button]:leading-normal',
              slice < index ? hidden : 'opacity-100',
            )}
          >
            {child}
          </div>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex select-none items-center gap-1',
              sizes.current.length - 1 === slice ? hidden : 'opacity-50',
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

interface WidgetTab<T extends string = string> {
  key: T;
  label: string;
}

interface WidgetHeadSearchableProps<T extends string = string> {
  tabs: WidgetTab<T>[];
  activeTab: T;
  className?: string;
  onTabChange: (key: T) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}

export function WidgetHeadSearchable<T extends string>({
  tabs,
  className,
  activeTab,
  onTabChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search',
}: WidgetHeadSearchableProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftGradient, setShowLeftGradient] = useState(false);
  const [showRightGradient, setShowRightGradient] = useState(false);

  const updateGradients = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    const hasOverflow = scrollWidth > clientWidth;

    setShowLeftGradient(hasOverflow && scrollLeft > 0);
    setShowRightGradient(
      hasOverflow && scrollLeft < scrollWidth - clientWidth - 1,
    );
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateGradients();

    el.addEventListener('scroll', updateGradients);
    window.addEventListener('resize', updateGradients);

    return () => {
      el.removeEventListener('scroll', updateGradients);
      window.removeEventListener('resize', updateGradients);
    };
  }, [updateGradients]);

  // Update gradients when tabs change
  useEffect(() => {
    // Use RAF to ensure DOM has updated
    requestAnimationFrame(updateGradients);
  }, [tabs, updateGradients]);

  return (
    <div className={cn('border-b border-border', className)}>
      {/* Scrollable tabs container */}
      <div className="relative">
        {/* Left gradient */}
        <div
          className={cn(
            'pointer-events-none absolute left-0 top-0 z-10 h-full w-8 bg-gradient-to-r from-card to-transparent transition-opacity duration-200',
            showLeftGradient ? 'opacity-100' : 'opacity-0',
          )}
        />

        {/* Scrollable tabs */}
        <div
          ref={scrollRef}
          className="flex gap-1 overflow-x-auto px-2 py-3 hide-scrollbar"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={cn(
                'shrink-0 rounded-md py-1.5 text-sm font-medium transition-colors px-2',
                activeTab === tab.key
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:bg-def-100 hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right gradient */}
        <div
          className={cn(
            'pointer-events-none absolute right-0 top-0 z-10 bottom-px w-8 bg-gradient-to-l from-card to-transparent transition-opacity duration-200',
            showRightGradient ? 'opacity-100' : 'opacity-0',
          )}
        />
      </div>

      {/* Search input */}
      {onSearchChange && (
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder={searchPlaceholder}
            value={searchValue ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 bg-transparent border-0 text-sm rounded-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground focus-visible:ring-offset-0 border-y"
          />
        </div>
      )}
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
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

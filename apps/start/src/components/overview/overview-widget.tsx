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
import { useThrottle } from '@/hooks/use-throttle';
import { cn } from '@/utils/cn';

export function WidgetHead({ className, ...props }: WidgetHeadProps) {
  return (
    <WidgetHeadBase
      className={cn(
        'relative flex flex-col rounded-t-xl p-0 [&_.title]:flex [&_.title]:items-center [&_.title]:p-4 [&_.title]:font-semibold',
        className
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
      className={cn('title row justify-start text-left', className)}
      {...props}
    >
      {Icon && (
        <div className="mr-2 rounded-lg bg-def-200 p-1">
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
        'row absolute top-1/2 right-4 -translate-y-1/2 gap-1',
        className
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
          container.current.querySelectorAll('button')
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
      className={cn(
        '-mt-2 -mb-px flex flex-wrap justify-start self-stretch px-4 transition-opacity [&_button.active]:border-black [&_button.active]:border-b-2 [&_button.active]:opacity-100 dark:[&_button.active]:border-white [&_button]:whitespace-nowrap [&_button]:py-1 [&_button]:text-sm [&_button]:opacity-50',
        className
      )}
      ref={container}
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
            type="button"
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
    if (!el) {
      return;
    }

    const { scrollLeft, scrollWidth, clientWidth } = el;
    const hasOverflow = scrollWidth > clientWidth;

    setShowLeftGradient(hasOverflow && scrollLeft > 0);
    setShowRightGradient(
      hasOverflow && scrollLeft < scrollWidth - clientWidth - 1
    );
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

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
    <div className={cn('border-border border-b', className)}>
      {/* Scrollable tabs container */}
      <div className="relative">
        {/* Left gradient */}
        <div
          className={cn(
            'pointer-events-none absolute top-0 left-0 z-10 h-full w-8 bg-gradient-to-r from-card to-transparent transition-opacity duration-200',
            showLeftGradient ? 'opacity-100' : 'opacity-0'
          )}
        />

        {/* Scrollable tabs */}
        <div
          className="hide-scrollbar flex gap-1 overflow-x-auto px-2 py-3"
          ref={scrollRef}
        >
          {tabs.map((tab) => (
            <button
              className={cn(
                'shrink-0 rounded-md px-2 py-1.5 font-medium text-sm transition-colors',
                activeTab === tab.key
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:bg-def-100 hover:text-foreground'
              )}
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right gradient */}
        <div
          className={cn(
            'pointer-events-none absolute top-0 right-0 bottom-px z-10 w-8 bg-gradient-to-l from-card to-transparent transition-opacity duration-200',
            showRightGradient ? 'opacity-100' : 'opacity-0'
          )}
        />
      </div>

      {/* Search input */}
      {onSearchChange && (
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-none border-0 border-y bg-transparent pl-9 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground focus-visible:ring-offset-0"
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            type="search"
            value={searchValue ?? ''}
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
        'flex rounded-b-md border-t bg-def-100 p-2 py-1',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

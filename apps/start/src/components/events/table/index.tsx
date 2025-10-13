import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronsUpDown, Settings2Icon } from 'lucide-react';

import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { OverviewFiltersDrawer } from '@/components/overview/filters/overview-filters-drawer';
import { Button } from '@/components/ui/button';
import { DataTableToolbarContainer } from '@/components/ui/data-table/data-table-toolbar';
import { useAppParams } from '@/hooks/use-app-params';
import { pushModal } from '@/modals';
import type { RouterInputs, RouterOutputs } from '@/trpc/client';
import { arePropsEqual } from '@/utils/are-props-equal';
import { cn } from '@/utils/cn';
import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { TRPCInfiniteData } from '@trpc/tanstack-react-query';
import { format } from 'date-fns';
import throttle from 'lodash.throttle';
import { CalendarIcon, Loader2Icon } from 'lucide-react';
import { parseAsIsoDateTime, useQueryState } from 'nuqs';
import { last } from 'ramda';
import { memo, useEffect, useRef, useState } from 'react';
import { useInViewport } from 'react-in-viewport';
import { useLocalStorage } from 'usehooks-ts';
import EventListener from '../event-listener';
import { EventItem, EventItemSkeleton } from './item';

export const useEventsViewOptions = () => {
  return useLocalStorage<Record<string, boolean | undefined>>(
    '@op:events-table-view-options',
    {
      properties: false,
    },
  );
};

type Props = {
  query: UseInfiniteQueryResult<
    TRPCInfiniteData<
      RouterInputs['event']['events'],
      RouterOutputs['event']['events']
    >,
    unknown
  >;
};

export const EventsTable = memo(
  ({ query }: Props) => {
    const [viewOptions] = useEventsViewOptions();
    const { isLoading } = query;
    const parentRef = useRef<HTMLDivElement>(null);
    const [scrollMargin, setScrollMargin] = useState(0);
    const inViewportRef = useRef<HTMLDivElement>(null);
    const { inViewport, enterCount } = useInViewport(inViewportRef, undefined, {
      disconnectOnLeave: true,
    });

    const data = query.data?.pages?.flatMap((p) => p.data) ?? [];

    const virtualizer = useWindowVirtualizer({
      count: data.length,
      estimateSize: () => 55,
      scrollMargin,
      overscan: 10,
    });

    useEffect(() => {
      const updateScrollMargin = throttle(() => {
        if (parentRef.current) {
          setScrollMargin(
            parentRef.current.getBoundingClientRect().top + window.scrollY,
          );
        }
      }, 500);

      // Initial calculation
      updateScrollMargin();

      // Listen for resize events
      window.addEventListener('resize', updateScrollMargin);

      return () => {
        window.removeEventListener('resize', updateScrollMargin);
      };
    }, []);

    useEffect(() => {
      virtualizer.measure();
    }, [viewOptions, virtualizer]);

    const hasNextPage = last(query.data?.pages ?? [])?.meta.next;

    useEffect(() => {
      if (
        hasNextPage &&
        data.length > 0 &&
        inViewport &&
        enterCount > 0 &&
        query.isFetchingNextPage === false
      ) {
        query.fetchNextPage();
      }
    }, [inViewport, enterCount, hasNextPage]);

    const visibleItems = virtualizer.getVirtualItems();

    return (
      <>
        <EventsTableToolbar query={query} />
        <div ref={parentRef} className="w-full">
          {isLoading && (
            <div className="w-full gap-2 col">
              <EventItemSkeleton />
              <EventItemSkeleton />
              <EventItemSkeleton />
              <EventItemSkeleton />
              <EventItemSkeleton />
              <EventItemSkeleton />
            </div>
          )}
          {!isLoading && data.length === 0 && (
            <FullPageEmptyState
              title="No events"
              description={"Start sending events and you'll see them here"}
            />
          )}
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {visibleItems.map((virtualRow) => (
              <div
                key={virtualRow.index}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${
                    virtualRow.start - virtualizer.options.scrollMargin
                  }px)`,
                  paddingBottom: '8px', // Gap between items
                }}
              >
                <EventItem
                  event={data[virtualRow.index]!}
                  viewOptions={viewOptions}
                />
              </div>
            ))}
          </div>
        </div>
        <div className="w-full h-10 center-center pt-4" ref={inViewportRef}>
          <div
            className={cn(
              'size-8 bg-background rounded-full center-center border opacity-0 transition-opacity',
              query.isFetchingNextPage && 'opacity-100',
            )}
          >
            <Loader2Icon className="size-4 animate-spin" />
          </div>
        </div>
      </>
    );
  },
  arePropsEqual(['query.isLoading', 'query.data', 'query.isFetchingNextPage']),
);

function EventsTableToolbar({
  query,
}: {
  query: Props['query'];
}) {
  const { projectId } = useAppParams();
  const [startDate, setStartDate] = useQueryState(
    'startDate',
    parseAsIsoDateTime,
  );
  const [endDate, setEndDate] = useQueryState('endDate', parseAsIsoDateTime);
  return (
    <DataTableToolbarContainer>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <EventListener onRefresh={() => query.refetch()} />
        <Button
          variant="outline"
          size="sm"
          icon={CalendarIcon}
          onClick={() => {
            pushModal('DateRangerPicker', {
              onChange: ({ startDate, endDate }) => {
                setStartDate(startDate);
                setEndDate(endDate);
              },
              startDate: startDate || undefined,
              endDate: endDate || undefined,
            });
          }}
        >
          {startDate && endDate
            ? `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d')}`
            : 'Date range'}
        </Button>
        <OverviewFiltersDrawer
          mode="events"
          projectId={projectId}
          enableEventsFilter
        />
        <OverviewFiltersButtons className="justify-end p-0" />
      </div>
      <EventsViewOptions />
    </DataTableToolbarContainer>
  );
}

export function EventsViewOptions() {
  const [viewOptions, setViewOptions] = useEventsViewOptions();
  const columns = {
    origin: 'Show origin',
    queryString: 'Show query string',
    referrer: 'Referrer',
    country: 'Country',
    os: 'OS',
    browser: 'Browser',
    profileId: 'Profile',
    createdAt: 'Created at',
    properties: 'Properties',
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label="Toggle columns"
          role="combobox"
          variant="outline"
          size="sm"
          className="ml-auto hidden h-8 lg:flex"
        >
          <Settings2Icon className="size-4 mr-2" />
          View
          <ChevronsUpDown className="opacity-50 ml-2 size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent align="end" className="w-44 p-0">
          <Command>
            <CommandInput placeholder="Search columns..." />
            <CommandList>
              <CommandEmpty>No columns found.</CommandEmpty>
              <CommandGroup>
                {Object.entries(columns).map(([column, label]) => (
                  <CommandItem
                    key={column}
                    onSelect={() =>
                      setViewOptions({
                        ...viewOptions,
                        // biome-ignore lint/complexity/noUselessTernary: we need this this viewOptions[column] can be undefined
                        [column]: viewOptions[column] === false ? true : false,
                      })
                    }
                  >
                    <span className="truncate">{label}</span>
                    <Check
                      className={cn(
                        'ml-auto size-4 shrink-0',
                        viewOptions[column] !== false
                          ? 'opacity-100'
                          : 'opacity-0',
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}

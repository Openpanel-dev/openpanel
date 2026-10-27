import { PopoverPortal } from '@radix-ui/react-popover';
import {
  CheckIcon,
  ChevronsUpDown,
  GanttChartIcon,
  LayersIcon,
  type LucideIcon,
  PlusIcon,
} from 'lucide-react';
import VirtualList from 'rc-virtual-list';
import * as React from 'react';
import { EventIcon } from '../events/event-icon';
import type { ButtonProps } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useNumber } from '@/hooks/use-numer-formatter';
import type { RouterOutputs } from '@/trpc/client';
import { cn } from '@/utils/cn';

/**
 * Type-safe ComboboxEvents component that supports both single and multiple selection.
 *
 * @example
 * // Single selection mode (default)
 * <ComboboxEvents<string>
 *   items={events}
 *   value={selectedEvent}
 *   onChange={(event: string) => setSelectedEvent(event)}
 *   placeholder="Select an event"
 * />
 *
 * @example
 * // Multiple selection mode
 * <ComboboxEvents<string, true>
 *   items={events}
 *   value={selectedEvents}
 *   onChange={(events: string[]) => setSelectedEvents(events)}
 *   placeholder="Select events"
 *   multiple={true}
 * />
 */
export interface ComboboxProps<T, TMultiple extends boolean = false> {
  placeholder: string;
  items: RouterOutputs['chart']['events'];
  value: TMultiple extends true ? T[] : T | null | undefined;
  onChange: TMultiple extends true ? (value: T[]) => void : (value: T) => void;
  className?: string;
  searchable?: boolean;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  /** Icon shown while nothing is selected. */
  icon?: LucideIcon;
  label?: string;
  align?: 'start' | 'end' | 'center';
  portal?: boolean;
  error?: string;
  disabled?: boolean;
  multiple?: TMultiple;
  maxDisplayItems?: number;
  /** Listed above the events; picking one calls `onSelectCustomEvent`. */
  customEvents?: CustomEventOption[];
  selectedCustomEventId?: string;
  onSelectCustomEvent?: (customEvent: CustomEventOption) => void;
  /**
   * Offer the typed name as an event when no known event matches, so a report
   * can be built before the event is first tracked.
   */
  allowUnseenEvents?: boolean;
}

interface CustomEventOption {
  id: string;
  name: string;
}

type EventOption = RouterOutputs['chart']['events'][number];

type Row =
  | { key: string; kind: 'custom'; customEvent: CustomEventOption }
  | { key: string; kind: 'event'; item: EventOption }
  | { key: string; kind: 'unseen'; name: string }
  | { key: string; kind: 'add'; name: string };

/**
 * Selected names missing from `items` (only possible with `allowUnseenEvents`)
 * stay listed so they can be seen and toggled off. The add row comes last, so
 * Enter keeps picking the first known match while a name is still being typed.
 */
export function getEventRows({
  items,
  customEvents,
  search,
  selectedValues,
  allowUnseenEvents,
}: {
  items: EventOption[];
  customEvents: CustomEventOption[];
  search: string;
  selectedValues: string[];
  allowUnseenEvents: boolean;
}): Row[] {
  const matchesSearch = (name: string) =>
    search === '' || name.toLowerCase().includes(search.toLowerCase());
  const knownNames = new Set(items.map((item) => item.name));
  const unseenSelectedNames = allowUnseenEvents
    ? selectedValues.filter((name) => name !== '' && !knownNames.has(name))
    : [];

  const rows: Row[] = [
    ...customEvents
      .filter((customEvent) => matchesSearch(customEvent.name))
      .map((customEvent) => ({
        key: `custom:${customEvent.id}`,
        kind: 'custom' as const,
        customEvent,
      })),
    ...unseenSelectedNames.filter(matchesSearch).map((name) => ({
      key: `unseen:${name}`,
      kind: 'unseen' as const,
      name,
    })),
    ...items
      .filter((item) => matchesSearch(item.name))
      .map((item) => ({ key: item.name, kind: 'event' as const, item })),
  ];

  const typedName = search.trim();
  const isTypedNameTaken =
    knownNames.has(typedName) ||
    unseenSelectedNames.includes(typedName) ||
    customEvents.some((customEvent) => customEvent.name === typedName);
  if (allowUnseenEvents && typedName !== '' && !isTypedNameTaken) {
    rows.push({ key: `add:${typedName}`, kind: 'add', name: typedName });
  }

  return rows;
}

export function ComboboxEvents<
  T extends string,
  TMultiple extends boolean = false,
>({
  placeholder,
  value,
  onChange,
  className,
  searchable,
  size,
  variant = 'outline',
  icon: PlaceholderIcon = GanttChartIcon,
  align = 'start',
  portal,
  error,
  disabled,
  items,
  multiple = false as TMultiple,
  maxDisplayItems = 2,
  customEvents = [],
  selectedCustomEventId,
  onSelectCustomEvent,
  allowUnseenEvents = false,
}: ComboboxProps<T, TMultiple>) {
  const number = useNumber();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');

  const selectedValues = React.useMemo((): T[] => {
    if (multiple) {
      return Array.isArray(value) ? (value as T[]) : value ? [value as T] : [];
    }
    return value ? [value as T] : [];
  }, [value, multiple]);

  function find(value: string) {
    return items.find(
      (item) => item.name.toLowerCase() === value.toLowerCase()
    );
  }

  const current =
    selectedValues.length > 0 && selectedValues[0]
      ? find(selectedValues[0])
      : null;
  const currentCustomEvent = customEvents.find(
    (customEvent) => customEvent.id === selectedCustomEventId
  );

  const rows = getEventRows({
    items,
    customEvents,
    search,
    // A selected custom event puts its own name in `value`.
    selectedValues: currentCustomEvent ? [] : selectedValues,
    allowUnseenEvents,
  });

  const handleSelection = (selectedValue: string) => {
    if (multiple) {
      const currentValues = selectedValues;
      const newValues = currentValues.includes(selectedValue as T)
        ? currentValues.filter((v) => v !== selectedValue)
        : [...currentValues, selectedValue as T];
      onChange(newValues as any);
    } else {
      onChange(selectedValue as any);
      setOpen(false);
    }
  };

  const renderTriggerIcon = () => {
    if (currentCustomEvent) {
      return <LayersIcon className="mr-2 shrink-0" size={16} />;
    }
    if (current?.meta) {
      return (
        <EventIcon
          className="mr-2 shrink-0"
          meta={current.meta}
          name={current.name}
          size="xs"
        />
      );
    }
    return <PlaceholderIcon className="mr-2 shrink-0" size={16} />;
  };

  const renderTriggerContent = () => {
    if (currentCustomEvent) {
      return currentCustomEvent.name;
    }
    if (selectedValues.length === 0) {
      return placeholder;
    }

    const firstValue = selectedValues[0];
    const item = firstValue ? find(firstValue) : null;
    let label = item?.name || firstValue;

    if (multiple && selectedValues.length > 1) {
      label += ` +${selectedValues.length - 1}`;
    }

    return label;
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className={cn(
            'justify-between',
            !!error && 'border-destructive',
            className
          )}
          disabled={disabled}
          role="combobox"
          size={size}
          variant={variant}
        >
          <div className="flex min-w-0 items-center">
            {renderTriggerIcon()}
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">
              {renderTriggerContent()}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          align={align}
          className="w-full max-w-[33em] p-0 max-sm:max-w-[100vw]"
          portal={portal}
        >
          <Command shouldFilter={false}>
            {searchable === true && (
              <CommandInput
                onValueChange={setSearch}
                placeholder="Search event..."
                value={search}
              />
            )}

            <CommandEmpty>Nothing selected</CommandEmpty>
            <VirtualList
              className="w-[33em] max-sm:max-w-[100vw]"
              data={rows}
              height={300}
              itemHeight={32}
              itemKey="key"
            >
              {(row) => {
                if (row.kind === 'custom') {
                  const isSelected =
                    row.customEvent.id === selectedCustomEventId;
                  return (
                    <CommandItem
                      className={cn(
                        'gap-4 p-4 py-2.5',
                        isSelected && 'bg-accent'
                      )}
                      key={row.key}
                      onSelect={() => {
                        onSelectCustomEvent?.(row.customEvent);
                        setOpen(false);
                      }}
                      value={row.key}
                    >
                      {isSelected ? (
                        <CheckIcon className="h-4 w-4 flex-shrink-0" />
                      ) : (
                        <LayersIcon className="h-4 w-4 flex-shrink-0" />
                      )}
                      <span className="flex-1 truncate font-medium">
                        {row.customEvent.name}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        Custom event
                      </span>
                    </CommandItem>
                  );
                }
                if (row.kind === 'add') {
                  return (
                    <CommandItem
                      className="gap-4 p-4 py-2.5"
                      key={row.key}
                      onSelect={() => {
                        handleSelection(row.name);
                      }}
                      value={row.key}
                    >
                      <PlusIcon className="h-4 w-4 flex-shrink-0" />
                      <span className="flex-1 truncate font-medium">
                        Add "{row.name}"
                      </span>
                      <span className="text-muted-foreground text-xs">
                        Not tracked yet
                      </span>
                    </CommandItem>
                  );
                }
                if (row.kind === 'unseen') {
                  return (
                    <CommandItem
                      className="gap-4 bg-accent p-4 py-2.5"
                      key={row.key}
                      onSelect={() => {
                        handleSelection(row.name);
                      }}
                      value={row.key}
                    >
                      <CheckIcon className="h-4 w-4 flex-shrink-0" />
                      <span className="flex-1 truncate font-medium">
                        {row.name}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        Not tracked yet
                      </span>
                    </CommandItem>
                  );
                }
                const { item } = row;
                const isSelected =
                  !currentCustomEvent &&
                  selectedValues.includes(item.name as T);
                return (
                  <CommandItem
                    className={cn(
                      'gap-4 p-4 py-2.5',
                      isSelected && 'bg-accent'
                    )}
                    key={row.key}
                    onSelect={() => {
                      handleSelection(item.name);
                    }}
                    value={item.name}
                  >
                    {isSelected ? (
                      <CheckIcon className="h-4 w-4 flex-shrink-0" />
                    ) : (
                      <EventIcon meta={item.meta} name={item.name} size="sm" />
                    )}
                    <span className="flex-1 truncate font-medium">
                      {item.name === '*' ? 'Any events' : item.name}
                    </span>
                    <span className="font-medium text-muted-foreground tabular-nums">
                      {number.short(item.count)}
                    </span>
                  </CommandItem>
                );
              }}
            </VirtualList>
          </Command>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}

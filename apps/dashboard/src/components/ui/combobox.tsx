'use client';

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
import { cn } from '@/utils/cn';
import { PopoverPortal } from '@radix-ui/react-popover';
import type { LucideIcon } from 'lucide-react';
import { Check, ChevronsUpDown } from 'lucide-react';
import VirtualList from 'rc-virtual-list';
import * as React from 'react';

export interface ComboboxProps<T> {
  placeholder: string;
  items: {
    value: T;
    label: string;
    disabled?: boolean;
  }[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  children?: React.ReactNode;
  onCreate?: (value: T) => void;
  className?: string;
  searchable?: boolean;
  icon?: LucideIcon;
  size?: ButtonProps['size'];
  label?: string;
  align?: 'start' | 'end' | 'center';
  portal?: boolean;
  error?: string;
  disabled?: boolean;
}

export type ExtendedComboboxProps<T> = Omit<
  ComboboxProps<T>,
  'items' | 'placeholder'
> & {
  placeholder?: string;
};

export function Combobox<T extends string>({
  placeholder,
  items,
  value,
  onChange,
  children,
  onCreate,
  className,
  searchable,
  icon: Icon,
  size,
  align = 'start',
  portal,
  error,
  disabled,
}: ComboboxProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  function find(value: string) {
    return items.find(
      (item) => item.value.toLowerCase() === value.toLowerCase(),
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <Button
            disabled={disabled}
            size={size}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              'justify-between',
              !!error && 'border-destructive',
              className,
            )}
          >
            <div className="flex min-w-0 items-center">
              {Icon ? <Icon size={16} className="mr-2 shrink-0" /> : null}
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                {value ? (find(value)?.label ?? 'No match') : placeholder}
              </span>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent
          className="w-full max-w-md p-0"
          align={align}
          portal={portal}
        >
          <Command shouldFilter={false}>
            {searchable === true && (
              <CommandInput
                placeholder="Search item..."
                value={search}
                onValueChange={setSearch}
              />
            )}
            {typeof onCreate === 'function' && search ? (
              <CommandEmpty className="p-2">
                <Button
                  onClick={() => {
                    onCreate(search as T);
                    setSearch('');
                    setOpen(false);
                  }}
                >
                  Create &quot;{search}&quot;
                </Button>
              </CommandEmpty>
            ) : (
              <CommandEmpty>Nothing selected</CommandEmpty>
            )}
            <VirtualList
              height={Math.min(items.length * 32, 300)}
              data={items.filter((item) => {
                if (search === '') return true;
                return item.label.toLowerCase().includes(search.toLowerCase());
              })}
              itemHeight={32}
              itemKey="value"
              className="min-w-60"
            >
              {(item) => (
                <CommandItem
                  key={item.value}
                  value={item.value}
                  onSelect={(currentValue) => {
                    const value = find(currentValue)?.value ?? currentValue;
                    onChange(value as T);
                    setOpen(false);
                  }}
                  {...(item.disabled && { disabled: true })}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 flex-shrink-0',
                      value === item.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {item.label}
                </CommandItem>
              )}
            </VirtualList>
          </Command>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}

import { PopoverPortal } from '@radix-ui/react-popover';
import type { LucideIcon } from 'lucide-react';
import { Check, ChevronsUpDown } from 'lucide-react';
import VirtualList from 'rc-virtual-list';
import * as React from 'react';
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
      (item) => item.value.toLowerCase() === value.toLowerCase()
    );
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        {children ?? (
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
            variant="outline"
          >
            <div className="flex min-w-0 items-center">
              {Icon ? <Icon className="mr-2 shrink-0" size={16} /> : null}
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
          align={align}
          className="w-full max-w-md p-0"
          portal={portal}
        >
          <Command shouldFilter={false}>
            {searchable === true && (
              <CommandInput
                onValueChange={setSearch}
                placeholder="Search item..."
                value={search}
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
              className="min-w-60"
              data={items.filter((item) => {
                if (search === '') {
                  return true;
                }
                return item.label.toLowerCase().includes(search.toLowerCase());
              })}
              height={Math.min(items.length * 32, 300)}
              itemHeight={32}
              itemKey="value"
            >
              {(item) => (
                <CommandItem
                  key={item.value}
                  onSelect={(currentValue) => {
                    const value = find(currentValue)?.value ?? currentValue;
                    onChange(value as T);
                    setOpen(false);
                  }}
                  value={item.value}
                  {...(item.disabled && { disabled: true })}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 flex-shrink-0',
                      value === item.value ? 'opacity-100' : 'opacity-0'
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

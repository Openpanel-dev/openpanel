import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/utils/cn';
import { Check, ChevronsUpDown } from 'lucide-react';

import { ScrollArea } from './scroll-area';

interface ComboboxProps {
  placeholder: string;
  items: {
    value: string;
    label: string;
    disabled?: boolean;
  }[];
  value: string;
  onChange: (value: string) => void;
  children?: React.ReactNode;
  onCreate?: (value: string) => void;
}

export function Combobox({
  placeholder,
  items,
  value,
  onChange,
  children,
  onCreate,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  function find(value: string) {
    return items.find(
      (item) => item.value.toLowerCase() === value.toLowerCase()
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? (
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between min-w-[150px]"
          >
            <span className="overflow-hidden text-ellipsis">
              {value ? find(value)?.label ?? 'No match' : placeholder}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-full min-w-0 p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search item..."
            value={search}
            onValueChange={setSearch}
          />
          {typeof onCreate === 'function' && search ? (
            <CommandEmpty className="p-2">
              <Button
                onClick={() => {
                  onCreate(search);
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
          <div className="max-h-[300px] overflow-scroll">
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.value}
                  onSelect={(currentValue) => {
                    const value = find(currentValue)?.value ?? currentValue;
                    onChange(value);
                    setOpen(false);
                  }}
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
              ))}
            </CommandGroup>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

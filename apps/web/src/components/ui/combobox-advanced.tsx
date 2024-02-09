'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import { ChevronsUpDownIcon } from 'lucide-react';
import { useOnClickOutside } from 'usehooks-ts';

import { Button } from './button';
import { Checkbox } from './checkbox';
import { Input } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

type IValue = any;
type IItem = Record<'value' | 'label', IValue>;

interface ComboboxAdvancedProps {
  value: IValue[];
  onChange: React.Dispatch<React.SetStateAction<IValue[]>>;
  items: IItem[];
  placeholder: string;
}

export function ComboboxAdvanced({
  items,
  value,
  onChange,
  placeholder,
}: ComboboxAdvancedProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');
  const ref = React.useRef<HTMLDivElement | null>(null);
  useOnClickOutside(ref, () => setOpen(false));

  const selectables = items
    .filter((item) => !value.find((s) => s === item.value))
    .filter(
      (item) =>
        (typeof item.label === 'string' &&
          item.label.toLowerCase().includes(inputValue.toLowerCase())) ||
        (typeof item.value === 'string' &&
          item.value.toLowerCase().includes(inputValue.toLowerCase()))
    );

  const renderItem = (item: IItem) => {
    const checked = !!value.find((s) => s === item.value);
    return (
      <CommandItem
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onSelect={() => {
          setInputValue('');
          onChange((prev) => {
            if (prev.includes(item.value)) {
              return prev.filter((s) => s !== item.value);
            }
            return [...prev, item.value];
          });
        }}
        className={'cursor-pointer flex items-center gap-2'}
      >
        <Checkbox checked={checked} className="pointer-events-none" />
        {item?.label ?? item?.value}
      </CommandItem>
    );
  };

  const renderUnknownItem = (value: IValue) => {
    const item = items.find((item) => item.value === value);
    return item ? renderItem(item) : renderItem({ value, label: value });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={'outline'} onClick={() => setOpen((prev) => !prev)}>
          <div className="flex gap-1 flex-wrap">
            {value.length === 0 && placeholder}
            {value.slice(0, 2).map((value) => {
              const item = items.find((item) => item.value === value) ?? {
                value,
                label: value,
              };
              return <Badge key={String(item.value)}>{item.label}</Badge>;
            })}
            {value.length > 2 && <Badge>+{value.length - 2} more</Badge>}
          </div>
          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full max-w-md p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search"
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandGroup>
            {inputValue === ''
              ? value.map(renderUnknownItem)
              : renderItem({
                  value: inputValue,
                  label: `Pick "${inputValue}"`,
                })}
            {selectables.map(renderItem)}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Command, CommandGroup, CommandItem } from '@/components/ui/command';
import { useOnClickOutside } from 'usehooks-ts';

import { Checkbox } from './checkbox';
import { Input } from './input';

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
        key={String(item.value)}
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
    <Command className="overflow-visible bg-white" ref={ref}>
      <button
        type="button"
        className="group border border-input px-3 py-2 text-sm ring-offset-background rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="flex gap-1 flex-wrap">
          {value.length === 0 && placeholder}
          {value.slice(0, 2).map((value) => {
            const item = items.find((item) => item.value === value) ?? {
              value,
              label: value,
            };
            return (
              <Badge key={String(item.value)} variant="secondary">
                {item.label}
              </Badge>
            );
          })}
          {value.length > 2 && (
            <Badge variant="secondary">+{value.length - 2} more</Badge>
          )}
        </div>
      </button>
      {open && (
        <div className="relative top-2">
          <div className="max-h-80 min-w-[300px] absolute w-full z-10 top-0 rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in">
            <CommandGroup className="max-h-80 overflow-auto">
              <div className="p-1 mb-2">
                <Input
                  placeholder="Type to search"
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                />
              </div>
              {inputValue === ''
                ? value.map(renderUnknownItem)
                : renderItem({
                    value: inputValue,
                    label: `Pick "${inputValue}"`,
                  })}
              {selectables.map(renderItem)}
            </CommandGroup>
          </div>
        </div>
      )}
    </Command>
  );
}

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Command, CommandGroup, CommandItem } from '@/components/ui/command';

import { Checkbox } from './checkbox';
import { Input } from './input';

type IValue = string | number | boolean | null;
type IItem = Record<'value' | 'label', IValue>;

interface ComboboxAdvancedProps {
  selected: IValue[];
  setSelected: React.Dispatch<React.SetStateAction<IValue[]>>;
  items: IItem[];
  placeholder: string;
}

export function ComboboxAdvanced({
  items,
  selected,
  setSelected,
  placeholder,
}: ComboboxAdvancedProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');

  const selectables = items
    .filter((item) => !selected.find((s) => s === item.value))
    .filter(
      (item) =>
        (typeof item.label === 'string' &&
          item.label.toLowerCase().includes(inputValue.toLowerCase())) ||
        (typeof item.value === 'string' &&
          item.value.toLowerCase().includes(inputValue.toLowerCase()))
    );

  const renderItem = (item: IItem) => {
    const checked = !!selected.find((s) => s === item.value);
    return (
      <CommandItem
        key={String(item.value)}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onSelect={() => {
          setInputValue('');
          setSelected((prev) => {
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

  const renderUnknownItem = (value: string | number | null | boolean) => {
    const item = items.find((item) => item.value === value);
    return item ? renderItem(item) : renderItem({ value, label: value });
  };

  return (
    <Command className="overflow-visible bg-white">
      <button
        type="button"
        className="group border border-input px-3 py-2 text-sm ring-offset-background rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="flex gap-1 flex-wrap">
          {selected.length === 0 && placeholder}
          {selected.slice(0, 2).map((value) => {
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
          {selected.length > 2 && (
            <Badge variant="secondary">+{selected.length - 2} more</Badge>
          )}
        </div>
      </button>
      <div className="relative mt-2">
        {open && (
          <div className="max-h-80 absolute w-full z-10 top-0 rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in">
            <CommandGroup className="max-h-80 overflow-auto">
              <div className="p-1 mb-2">
                <Input
                  placeholder="Type to search"
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                />
              </div>
              {inputValue === ''
                ? selected.map(renderUnknownItem)
                : renderUnknownItem(inputValue)}
              {selectables.map(renderItem)}
            </CommandGroup>
          </div>
        )}
      </div>
    </Command>
  );
}

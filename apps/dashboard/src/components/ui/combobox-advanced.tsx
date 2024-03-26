import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ChevronsUpDownIcon } from 'lucide-react';
import { useOnClickOutside } from 'usehooks-ts';

import { Button } from './button';
import { Checkbox } from './checkbox';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

type IValue = any;
type IItem = Record<'value' | 'label', IValue>;

interface ComboboxAdvancedProps {
  value: IValue[];
  onChange: (value: IValue[]) => void;
  items: IItem[];
  placeholder: string;
  className?: string;
}

export function ComboboxAdvanced({
  items,
  value,
  onChange,
  placeholder,
  className,
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
          onChange(
            value.includes(item.value)
              ? value.filter((s) => s !== item.value)
              : [...value, item.value]
          );
        }}
        className={'flex cursor-pointer items-center gap-2'}
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
        <Button
          variant={'outline'}
          onClick={() => setOpen((prev) => !prev)}
          className={className}
        >
          <div className="flex w-full flex-wrap gap-1">
            {value.length === 0 && placeholder}
            {value.map((value) => {
              const item = items.find((item) => item.value === value) ?? {
                value,
                label: value,
              };
              return <Badge key={String(item.value)}>{item.label}</Badge>;
            })}
          </div>
          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full max-w-md p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search"
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList>
            {inputValue !== '' &&
              renderItem({
                value: inputValue,
                label: `Pick '${inputValue}'`,
              })}
            {value.map(renderUnknownItem)}
            {selectables.map(renderItem)}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

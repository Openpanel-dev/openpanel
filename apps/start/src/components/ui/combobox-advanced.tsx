import { ChevronsUpDownIcon } from 'lucide-react';
import VirtualList from 'rc-virtual-list';
import * as React from 'react';
import { Button, type ButtonProps } from './button';
import { DumpCheckbox } from './checkbox';
import {
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
} from './popover';
import { Badge } from '@/components/ui/badge';
import { Command, CommandInput, CommandItem } from '@/components/ui/command';

type IValue = any;
type IItem = Record<'value' | 'label', IValue>;

const sanitize = (value: string) => {
  return encodeURIComponent(value.replaceAll('"', '&quot;'));
};

const desanitize = (value: string) => {
  return decodeURIComponent(value).replaceAll('&quot;', '"');
};

interface ComboboxAdvancedProps {
  value: IValue[];
  onChange: (value: IValue[]) => void;
  items: IItem[];
  placeholder?: string;
  className?: string;
  size?: ButtonProps['size'];
  children?: React.ReactNode;
}

export function ComboboxAdvanced({
  items,
  value,
  onChange,
  placeholder,
  className,
  size,
  children,
}: ComboboxAdvancedProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');

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
    const checked = !!value.find((s) => s === desanitize(item.value));
    return (
      <CommandItem
        className={'flex cursor-pointer items-center gap-2'}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onSelect={() => {
          setInputValue('');
          onChange(
            value.includes(desanitize(item.value))
              ? value.filter((s) => s !== desanitize(item.value))
              : [...value, desanitize(item.value)]
          );
        }}
        value={item.value}
      >
        <DumpCheckbox checked={checked} />
        {desanitize(item?.label ?? item?.value)}
      </CommandItem>
    );
  };

  const data = React.useMemo(() => {
    const known = [
      ...value.map((val) => {
        const item = items.find((item) => item.value === val);
        return item
          ? { value: val, label: item.label }
          : { value: val, label: val };
      }),
      ...selectables,
    ].filter((item) => item.value);

    // The "Pick '…'" entry is only offered for a value that is not already in
    // the list. Offering it for an exact match gave two rows the same `value`,
    // which is the list's React key, and the duplicate made the real row
    // unselectable.
    const isNewValue =
      inputValue !== '' && !known.some((item) => item.value === inputValue);

    return isNewValue
      ? [{ value: inputValue, label: `Pick '${inputValue}'` }, ...known]
      : known;
  }, [inputValue, selectables, items, value]);

  const trigger = children ?? (
    <Button autoHeight className={className} size={size} variant={'outline'}>
      <div className="flex w-full flex-wrap gap-1">
        {value.length === 0 && placeholder}
        {value.map((val) => {
          const item = items.find((item) => item.value === val) ?? {
            value: val,
            label: val,
          };
          return <Badge key={String(item.value)}>{item.label}</Badge>;
        })}
      </div>
      <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverPortal>
        {/* `w-full` resolved against the PORTAL, not the trigger, so the
            popover opened at an unrelated width and position. */}
        <PopoverContent
          align="start"
          className="w-[--radix-popover-trigger-width] max-w-md p-0"
        >
          <Command shouldFilter={false}>
            <CommandInput
              onValueChange={setInputValue}
              placeholder="Search"
              value={inputValue}
            />
            <VirtualList
              data={data.map((item) => ({
                ...item,
                label: sanitize(item.label),
                value: sanitize(item.value),
              }))}
              height={Math.min(items.length * 32, 300)}
              itemHeight={32}
              itemKey="value"
            >
              {renderItem}
            </VirtualList>
          </Command>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}

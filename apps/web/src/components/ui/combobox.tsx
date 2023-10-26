import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type ComboboxProps = {
  placeholder: string;
  items: Array<{
    value: string;
    label: string;
  }>;
  value: string;
  onChange: (value: string) => void;
  children?: React.ReactNode
};

export function Combobox({
  placeholder,
  items,
  value,
  onChange,
  children
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  
  function find(value: string) {
    return items.find(
      (item) => item.value.toLowerCase() === value.toLowerCase(),
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children ?? <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full min-w-0 justify-between"
        >
          <span className="overflow-hidden text-ellipsis">{value ? find(value)?.label ?? "No match" : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>}
      </PopoverTrigger>
      <PopoverContent className="w-full min-w-0 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search item..." />
          <CommandEmpty>Nothing selected</CommandEmpty>
          <CommandGroup className="max-h-[200px] overflow-auto">
            {items.map((item) => (
              <CommandItem
                key={item.value}
                value={item.value}
                onSelect={(currentValue) => {
                  const value = find(currentValue)?.value ?? currentValue;
                  onChange(value);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4 flex-shrink-0",
                    value === item.value ? "opacity-100" : "opacity-0",
                  )}
                />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

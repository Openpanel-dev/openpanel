import { cloneElement } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type DropdownProps<Value> = {
  children: React.ReactNode;
  label?: string;
  items: Array<{
    label: string;
    value: Value;
  }>;
  onChange?: (value: Value) => void;
};

export function Dropdown<Value extends string>({ children, label, items, onChange }: DropdownProps<Value>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        {label && (
          <>
            <DropdownMenuLabel>{label}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          {items.map((item) => (
            <DropdownMenuItem
              className="cursor-pointer"
              key={item.value}
              onClick={() => {
                onChange?.(item.value);
              }}
            >
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

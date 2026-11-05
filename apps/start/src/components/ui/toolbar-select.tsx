import { CheckIcon, type LucideIcon } from 'lucide-react';
import { Button } from './button';
import { CommandShortcut } from './command';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { cn } from '@/utils/cn';

/**
 * The value pickers for page toolbars: an outline button showing the icon and
 * current value, opening a menu titled with what is being picked. Form fields
 * use `Select` or `Combobox variant="input"` instead.
 */

export interface ToolbarSelectOption<Value extends string> {
  value: Value;
  label: string;
}

interface ToolbarSelectProps<Value extends string> {
  icon: LucideIcon;
  /** What is being picked; titles the menu and names the button for screen readers. */
  label: string;
  value: Value;
  options: readonly ToolbarSelectOption<Value>[];
  onChange: (value: Value) => void;
  /** Show only the icon below the sm breakpoint. */
  responsive?: boolean;
  className?: string;
}

export function ToolbarSelect<Value extends string>({
  icon,
  label,
  value,
  options,
  onChange,
  responsive,
  className,
}: ToolbarSelectProps<Value>) {
  const selected = options.find((option) => option.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`${label}: ${selected?.label ?? 'none'}`}
          className={cn('justify-start', className)}
          icon={icon}
          responsive={responsive}
          variant="outline"
        >
          {selected?.label ?? label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="row items-center justify-between gap-4">
          {label}
          {selected && <CommandShortcut>{selected.label}</CommandShortcut>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {options.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => onChange(option.value)}
            >
              {option.label}
              {option.value === value && (
                <DropdownMenuShortcut>
                  <CheckIcon className="size-4" />
                </DropdownMenuShortcut>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface ToolbarMultiSelectOption {
  value: string;
  label?: string;
  /** How often the value occurs, shown muted next to it. */
  count?: number;
}

interface ToolbarMultiSelectProps {
  icon: LucideIcon;
  label: string;
  options: readonly ToolbarMultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  emptyText?: string;
  responsive?: boolean;
  className?: string;
}

export function ToolbarMultiSelect({
  icon,
  label,
  options,
  selected,
  onChange,
  emptyText = 'Nothing to pick',
  responsive,
  className,
}: ToolbarMultiSelectProps) {
  const hasSelection = selected.length > 0;
  const toggle = (value: string, checked: boolean) =>
    onChange(
      checked
        ? [...selected, value]
        : selected.filter((current) => current !== value)
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={label}
          className={cn('justify-start', className)}
          icon={icon}
          responsive={responsive}
          variant="outline"
        >
          {label}
          {hasSelection && (
            <span className="ml-2 rounded bg-def-200 px-1.5 font-mono text-2xs">
              {selected.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="row items-center justify-between gap-4">
          {label}
          {hasSelection && (
            <CommandShortcut>{selected.length} selected</CommandShortcut>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length === 0 && (
          <div className="px-2 py-1.5 text-muted-foreground text-sm">
            {emptyText}
          </div>
        )}
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            checked={selected.includes(option.value)}
            key={option.value}
            onCheckedChange={(checked) => toggle(option.value, checked)}
            onSelect={(event) => event.preventDefault()}
          >
            <span className="min-w-0 flex-1 truncate">
              {option.label ?? option.value}
            </span>
            {option.count !== undefined && (
              <span className="ml-2 font-mono text-2xs text-muted-foreground">
                {option.count}
              </span>
            )}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  Loader2Icon,
  XIcon,
} from 'lucide-react';
import VirtualList from 'rc-virtual-list';
import { useEffect, useState } from 'react';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/utils/cn';

export type FilterType = 'select' | 'string' | 'number';

export interface FilterDefinition {
  key: string;
  label: string;
  type: FilterType;
  /** For 'select' type: show SerieIcon next to options (default true) */
  showIcon?: boolean;
}

interface FilterDropdownProps {
  definitions: FilterDefinition[];
  values: Record<string, string | number | null | undefined>;
  onChange: (key: string, value: string | number | null) => void;
  loadOptions: (key: string) => Promise<string[]>;
  children: React.ReactNode;
}

export function FilterDropdown({
  definitions,
  values,
  onChange,
  loadOptions,
  children,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (!open) {
      setActiveKey(null);
      setSearch('');
      setOptions([]);
      setInputValue('');
    }
  }, [open]);

  useEffect(() => {
    if (!activeKey) {
      return;
    }
    const def = definitions.find((d) => d.key === activeKey);
    if (!def || def.type !== 'select') {
      return;
    }

    setIsLoading(true);
    loadOptions(activeKey)
      .then((opts) => {
        setOptions(opts);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [activeKey]);

  const currentDef = activeKey
    ? definitions.find((d) => d.key === activeKey)
    : null;

  const goToFilter = (key: string) => {
    setDirection('forward');
    setSearch('');
    setOptions([]);
    const current = values[key];
    setInputValue(current != null ? String(current) : '');
    setActiveKey(key);
  };

  const goBack = () => {
    setDirection('backward');
    setActiveKey(null);
    setSearch('');
  };

  const applyValue = (key: string, value: string | number | null) => {
    onChange(key, value);
    goBack();
  };

  const renderIndex = () => (
    <div className="min-w-52">
      {definitions.map((def) => {
        const currentValue = values[def.key];
        const isActive = currentValue != null && currentValue !== '';
        return (
          <button
            className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-3 py-2 hover:bg-accent"
            key={def.key}
            onClick={() => goToFilter(def.key)}
            type="button"
          >
            <span className="font-medium text-sm">{def.label}</span>
            <div className="flex shrink-0 items-center gap-1">
              {isActive && (
                <>
                  <span className="max-w-24 truncate text-muted-foreground text-xs">
                    {String(currentValue)}
                  </span>
                  <button
                    className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(def.key, null);
                    }}
                    type="button"
                  >
                    <XIcon className="size-3" />
                  </button>
                </>
              )}
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </div>
          </button>
        );
      })}
    </div>
  );

  const renderSelectFilter = () => {
    const showIcon = currentDef?.showIcon !== false;
    const filteredOptions = options.filter((opt) =>
      opt.toLowerCase().includes(search.toLowerCase())
    );
    const currentValue = activeKey ? values[activeKey] : undefined;

    return (
      <div className="min-w-52">
        <div className="flex items-center gap-1 p-1">
          <Button
            className="size-7 shrink-0"
            onClick={goBack}
            size="icon"
            variant="ghost"
          >
            <ArrowLeftIcon className="size-4" />
          </Button>
          <Input
            autoFocus
            className="h-7 text-sm"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            value={search}
          />
        </div>
        <Separator />
        {isLoading ? (
          <div className="flex items-center justify-center p-6 text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
          </div>
        ) : filteredOptions.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No options found
          </div>
        ) : (
          <VirtualList
            data={filteredOptions}
            height={Math.min(filteredOptions.length * 36, 250)}
            itemHeight={36}
            itemKey={(item) => item}
          >
            {(option) => (
              <button
                className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 hover:bg-accent"
                onClick={() => applyValue(activeKey!, option)}
                type="button"
              >
                {showIcon && <SerieIcon name={option} />}
                <span className="truncate text-sm">{option || 'Direct'}</span>
                <CheckIcon
                  className={cn(
                    'ml-auto size-4 shrink-0',
                    currentValue === option ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </button>
            )}
          </VirtualList>
        )}
      </div>
    );
  };

  const renderStringFilter = () => (
    <div className="min-w-52">
      <div className="flex items-center gap-1 p-1">
        <Button
          className="size-7 shrink-0"
          onClick={goBack}
          size="icon"
          variant="ghost"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <span className="px-1 font-medium text-sm">{currentDef?.label}</span>
      </div>
      <Separator />
      <div className="flex flex-col gap-2 p-2">
        <Input
          autoFocus
          className="h-8 text-sm"
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              applyValue(activeKey!, inputValue || null);
            }
          }}
          placeholder={`Filter by ${currentDef?.label.toLowerCase()}...`}
          value={inputValue}
        />
        <Button
          className="w-full"
          onClick={() => applyValue(activeKey!, inputValue || null)}
          size="sm"
        >
          Apply
        </Button>
      </div>
    </div>
  );

  const renderNumberFilter = () => (
    <div className="min-w-52">
      <div className="flex items-center gap-1 p-1">
        <Button
          className="size-7 shrink-0"
          onClick={goBack}
          size="icon"
          variant="ghost"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <span className="px-1 font-medium text-sm">{currentDef?.label}</span>
      </div>
      <Separator />
      <div className="flex flex-col gap-2 p-2">
        <Input
          autoFocus
          className="h-8 text-sm"
          inputMode="numeric"
          min={0}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              applyValue(
                activeKey!,
                inputValue === '' ? null : Number(inputValue)
              );
            }
          }}
          placeholder="Enter value..."
          type="number"
          value={inputValue}
        />
        <Button
          className="w-full"
          onClick={() =>
            applyValue(
              activeKey!,
              inputValue === '' ? null : Number(inputValue)
            )
          }
          size="sm"
        >
          Apply
        </Button>
      </div>
    </div>
  );

  const renderContent = () => {
    if (!(activeKey && currentDef)) {
      return renderIndex();
    }
    switch (currentDef.type) {
      case 'select':
        return renderSelectFilter();
      case 'string':
        return renderStringFilter();
      case 'number':
        return renderNumberFilter();
    }
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-1">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction === 'forward' ? -20 : 20 }}
            initial={{ opacity: 0, x: direction === 'forward' ? 20 : -20 }}
            key={activeKey ?? 'index'}
            transition={{ duration: 0.1 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}

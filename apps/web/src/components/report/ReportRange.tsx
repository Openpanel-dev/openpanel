import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useDispatch, useSelector } from '@/redux';
import { cn } from '@/utils/cn';
import { endOfDay, format, startOfDay } from 'date-fns';
import { CalendarIcon, ChevronsUpDownIcon } from 'lucide-react';
import type { SelectRangeEventHandler } from 'react-day-picker';

import { timeRanges } from '@mixan/constants';
import type { IChartRange } from '@mixan/validation';

import type { ExtendedComboboxProps } from '../ui/combobox';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { changeDates, changeEndDate, changeStartDate } from './reportSlice';

export function ReportRange({
  range,
  onRangeChange,
  onDatesChange,
  dates,
  className,
  ...props
}: {
  range: IChartRange;
  onRangeChange: (range: IChartRange) => void;
  onDatesChange: SelectRangeEventHandler;
  dates: { startDate: string | null; endDate: string | null };
} & Omit<ExtendedComboboxProps<string>, 'value' | 'onChange'>) {
  const { isBelowSm } = useBreakpoint('sm');

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={'outline'}
            className={cn('justify-start text-left font-normal', className)}
            icon={CalendarIcon}
            {...props}
          >
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
              {dates.startDate ? (
                dates.endDate ? (
                  <>
                    {format(dates.startDate, 'LLL dd')} -{' '}
                    {format(dates.endDate, 'LLL dd')}
                  </>
                ) : (
                  format(dates.startDate, 'LLL dd, y')
                )
              ) : (
                <span>{range}</span>
              )}
            </span>
            <ChevronsUpDownIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-4 border-b border-border">
            <ToggleGroup
              value={range}
              onValueChange={(value) => {
                if (value) onRangeChange(value as IChartRange);
              }}
              type="single"
              variant="outline"
              className="flex-wrap max-sm:max-w-xs"
            >
              {Object.values(timeRanges).map((key) => (
                <ToggleGroupItem value={key} aria-label={key} key={key}>
                  {key}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={
              dates.startDate ? new Date(dates.startDate) : new Date()
            }
            selected={{
              from: dates.startDate ? new Date(dates.startDate) : undefined,
              to: dates.endDate ? new Date(dates.endDate) : undefined,
            }}
            onSelect={onDatesChange}
            numberOfMonths={isBelowSm ? 1 : 2}
            className="[&_table]:mx-auto [&_table]:w-auto"
          />
        </PopoverContent>
      </Popover>
    </>
  );
}

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { pushModal } from '@/modals';
import { useDispatch, useSelector } from '@/redux';
import { cn } from '@/utils/cn';
import { addDays, endOfDay, format, startOfDay, subDays } from 'date-fns';
import { CalendarIcon, ChevronsUpDownIcon } from 'lucide-react';
import type { DateRange, SelectRangeEventHandler } from 'react-day-picker';

import { timeRanges } from '@mixan/constants';
import type { IChartRange } from '@mixan/validation';

import type { ExtendedComboboxProps } from '../ui/combobox';
import { Combobox } from '../ui/combobox';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { changeDates, changeEndDate, changeStartDate } from './reportSlice';

export function ReportRange({
  onChange,
  value,
  className,
  ...props
}: ExtendedComboboxProps<IChartRange>) {
  const dispatch = useDispatch();
  const startDate = useSelector((state) => state.report.startDate);
  const endDate = useSelector((state) => state.report.endDate);

  const setDate: SelectRangeEventHandler = (val) => {
    if (!val) return;

    if (val.from && val.to) {
      dispatch(
        changeDates({
          startDate: startOfDay(val.from).toISOString(),
          endDate: endOfDay(val.to).toISOString(),
        })
      );
    } else if (val.from) {
      dispatch(changeStartDate(startOfDay(val.from).toISOString()));
    } else if (val.to) {
      dispatch(changeEndDate(endOfDay(val.to).toISOString()));
    }
  };

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
              {startDate ? (
                endDate ? (
                  <>
                    {format(startDate, 'LLL dd')} - {format(endDate, 'LLL dd')}
                  </>
                ) : (
                  format(startDate, 'LLL dd, y')
                )
              ) : (
                <span>{value}</span>
              )}
            </span>
            <ChevronsUpDownIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="p-4 border-b border-border">
            <ToggleGroup
              value={value}
              onValueChange={(value) => {
                if (value) onChange(value);
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
            defaultMonth={startDate ? new Date(startDate) : new Date()}
            selected={{
              from: startDate ? new Date(startDate) : undefined,
              to: endDate ? new Date(endDate) : undefined,
            }}
            onSelect={setDate}
            numberOfMonths={isBelowSm ? 1 : 2}
            className="[&_table]:mx-auto [&_table]:w-auto"
          />
        </PopoverContent>
      </Popover>
    </>
  );
}

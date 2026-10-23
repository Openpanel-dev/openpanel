import type { IInterval } from '@openpanel/core/modules/report/report.constants';
import { getDefaultIntervalByDates } from '@openpanel/core/modules/report/report.constants';
import { endOfDay, startOfDay, subMonths } from 'date-fns';
import { CheckIcon } from 'lucide-react';
import { useState } from 'react';
import { popModal } from '.';
import { ModalContent } from './Modal/Container';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { DialogFooter } from '@/components/ui/dialog';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { formatDate } from '@/utils/date';

interface Props {
  /** `startDate` is the start of the first picked day, `endDate` the end of the last, in the browser's timezone. */
  onChange: (payload: {
    startDate: Date;
    endDate: Date;
    interval: IInterval;
  }) => void;
  startDate?: Date;
  endDate?: Date;
}
export default function DateRangerPicker({
  onChange,
  startDate: initialStartDate,
  endDate: initialEndDate,
}: Props) {
  const { isBelowSm } = useBreakpoint('sm');
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);

  return (
    <ModalContent bodyClassName="p-4 md:p-8" className="min-w-fit">
      <Calendar
        captionLayout="dropdown"
        className="mx-auto min-h-[310px] p-0 [&_table]:mx-auto [&_table]:w-auto"
        defaultMonth={subMonths(
          startDate ? new Date(startDate) : new Date(),
          isBelowSm ? 0 : 1
        )}
        hidden={{
          after: endOfDay(new Date()),
        }}
        initialFocus
        mode="range"
        numberOfMonths={isBelowSm ? 1 : 2}
        onSelect={(range) => {
          if (range?.from) {
            setStartDate(range.from);
          }
          if (range?.to) {
            setEndDate(range.to);
          }
        }}
        selected={{
          from: startDate,
          to: endDate,
        }}
      />
      <DialogFooter>
        <Button onClick={() => popModal()} type="button" variant="outline">
          Cancel
        </Button>
        {startDate && endDate && (
          <Button
            icon={CheckIcon}
            onClick={() => {
              popModal();
              const rangeStart = startOfDay(startDate);
              const rangeEnd = endOfDay(endDate);
              onChange({
                startDate: rangeStart,
                endDate: rangeEnd,
                interval: getDefaultIntervalByDates(
                  rangeStart.toISOString(),
                  rangeEnd.toISOString()
                )!,
              });
            }}
            type="button"
          >
            Select {formatDate(startDate)} - {formatDate(endDate)}
          </Button>
        )}
      </DialogFooter>
    </ModalContent>
  );
}

import { getDefaultIntervalByDates } from '@openpanel/constants';
import type { IInterval } from '@openpanel/validation';
import { endOfDay, subMonths } from 'date-fns';
import { CheckIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { popModal } from '.';
import { ModalContent } from './Modal/Container';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { formatDate } from '@/utils/date';

interface Props {
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
    <ModalContent className="min-w-fit p-4 md:p-8">
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
      <div className="col md:row flex-col-reverse gap-2">
        <Button
          icon={XIcon}
          onClick={() => popModal()}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>

        {startDate && endDate && (
          <Button
            className="md:ml-auto"
            icon={startDate && endDate ? CheckIcon : XIcon}
            onClick={() => {
              popModal();
              if (startDate && endDate) {
                onChange({
                  startDate,
                  endDate,
                  interval: getDefaultIntervalByDates(
                    startDate.toISOString(),
                    endDate.toISOString()
                  )!,
                });
              }
            }}
            type="button"
          >
            {startDate && endDate
              ? `Select ${formatDate(startDate)} - ${formatDate(endDate)}`
              : 'Cancel'}
          </Button>
        )}
      </div>
    </ModalContent>
  );
}

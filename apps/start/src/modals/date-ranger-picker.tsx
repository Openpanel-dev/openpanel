import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { useBreakpoint } from '@/hooks/use-breakpoint';
import { subMonths } from 'date-fns';
import { useState } from 'react';

import { Input } from '@/components/ui/input';
import { formatDate } from '@/utils/date';
import { CheckIcon, XIcon } from 'lucide-react';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type Props = {
  onChange: (payload: { startDate: Date; endDate: Date }) => void;
  startDate?: Date;
  endDate?: Date;
};
export default function DateRangerPicker({
  onChange,
  startDate: initialStartDate,
  endDate: initialEndDate,
}: Props) {
  const { isBelowSm } = useBreakpoint('sm');
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);

  return (
    <ModalContent className="p-4 md:p-8 min-w-fit">
      <Calendar
        captionLayout="dropdown"
        initialFocus
        mode="range"
        defaultMonth={subMonths(
          startDate ? new Date(startDate) : new Date(),
          isBelowSm ? 0 : 1,
        )}
        selected={{
          from: startDate,
          to: endDate,
        }}
        toDate={new Date()}
        onSelect={(range) => {
          if (range?.from) {
            setStartDate(range.from);
          }
          if (range?.to) {
            setEndDate(range.to);
          }
        }}
        numberOfMonths={isBelowSm ? 1 : 2}
        className="mx-auto min-h-[310px] [&_table]:mx-auto [&_table]:w-auto p-0"
      />
      <div className="col flex-col-reverse md:row gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => popModal()}
          icon={XIcon}
        >
          Cancel
        </Button>

        {startDate && endDate && (
          <Button
            type="button"
            className="md:ml-auto"
            onClick={() => {
              popModal();
              if (startDate && endDate) {
                onChange({
                  startDate: startDate,
                  endDate: endDate,
                });
              }
            }}
            icon={startDate && endDate ? CheckIcon : XIcon}
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

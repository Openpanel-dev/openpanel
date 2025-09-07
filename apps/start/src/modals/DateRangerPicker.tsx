import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { subMonths } from 'date-fns';
import { useState } from 'react';

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
    <ModalContent className="max-w-[540px]!">
      <ModalHeader title="Pick a date range" className="mb-0" />
      <Calendar
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
        className="mx-auto min-h-[350px] [&_table]:mx-auto [&_table]:w-auto"
      />
      <Button
        className="mt-8"
        onClick={() => {
          popModal();
          if (startDate && endDate) {
            onChange({
              startDate: startDate,
              endDate: endDate,
            });
          }
        }}
      >
        Select
      </Button>
    </ModalContent>
  );
}

import { format } from 'date-fns';
import { CalendarIcon, ClockIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

// Utility function to round date to nearest 5-minute interval
function roundToNearestFiveMinutes(date: Date): Date {
  const roundedDate = new Date(date);
  const minutes = roundedDate.getMinutes();
  const remainder = minutes % 5;

  if (remainder === 0) {
    return roundedDate;
  }

  // Round to nearest 5-minute interval
  if (remainder >= 2.5) {
    // Round up
    roundedDate.setMinutes(minutes + (5 - remainder));
  } else {
    // Round down
    roundedDate.setMinutes(minutes - remainder);
  }

  // Reset seconds and milliseconds
  roundedDate.setSeconds(0);
  roundedDate.setMilliseconds(0);

  return roundedDate;
}

type Props = {
  onChange: (date: Date) => void;
  initialDate?: Date;
  title?: string;
};

export default function DateTimePicker({
  onChange,
  initialDate,
  title = 'Select Date & Time',
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(
    roundToNearestFiveMinutes(initialDate || new Date())
  );

  // Generate all time options with 5-minute intervals
  const generateTimeOptions = () => {
    const times = [];
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute += 5) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const displayTime = format(new Date(2000, 0, 1, hour, minute), 'HH:mm');
        times.push({ value: timeString, label: displayTime });
      }
    }
    return times;
  };

  const timeOptions = generateTimeOptions();

  function handleDateSelect(date: Date | undefined) {
    if (date) {
      // Preserve the existing time when changing date
      const newDate = new Date(date);
      newDate.setHours(selectedDate.getHours());
      newDate.setMinutes(selectedDate.getMinutes());
      // Round to nearest 5-minute interval
      setSelectedDate(roundToNearestFiveMinutes(newDate));
    }
  }

  function handleTimeSelect(timeValue: string) {
    const [hours, minutes] = timeValue.split(':').map(Number);
    const newDate = new Date(selectedDate);
    newDate.setHours(hours);
    newDate.setMinutes(minutes);
    // Ensure alignment to 5-minute intervals (safety measure)
    setSelectedDate(roundToNearestFiveMinutes(newDate));
  }

  const currentTimeValue = `${selectedDate.getHours().toString().padStart(2, '0')}:${selectedDate.getMinutes().toString().padStart(2, '0')}`;

  // Scroll to selected time when modal opens
  useEffect(() => {
    const buttonSize = 32;
    const buttonMargin = 2;
    const containerPadding = 4;

    const scrollContainer = scrollRef.current;
    const buttonIndex = timeOptions.findIndex(
      (time) => time.value === currentTimeValue
    );
    const calculatedScrollTo =
      Math.max(0, buttonIndex - 4) * (buttonSize + buttonMargin) +
      containerPadding;

    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: calculatedScrollTo,
        behavior: 'instant',
      });
    }
  }, []); // Empty dependency array to run only on mount

  return (
    <ModalContent className="max-w-[400px]">
      <ModalHeader title={title} />

      <div className="space-y-4">
        {/* Selected Date/Time Display */}
        <div className="rounded-lg border border-dashed bg-muted/50 p-4">
          <div className="flex items-center justify-center space-x-2 text-sm">
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">
              {format(selectedDate, 'EEEE, MMMM d, yyyy')}
            </span>
            <div className="h-4 w-px bg-border" />
            <ClockIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium font-mono">
              {format(selectedDate, 'HH:mm')}
            </span>
          </div>
        </div>

        {/* Calendar Section */}
        <div className="row h-[333px] gap-2">
          <Calendar
            className="rounded-lg border [&_table]:mx-auto [&_table]:w-auto"
            initialFocus
            mode="single"
            onSelect={handleDateSelect}
            selected={selectedDate}
          />
          <ScrollArea
            className="h-full w-full rounded-lg border bg-background/50"
            ref={scrollRef}
          >
            <div className="flex flex-col p-1">
              {timeOptions.map((time) => (
                <Button
                  className={cn(
                    'mb-0.5 h-8 w-full justify-start font-mono text-xs transition-all duration-200',
                    currentTimeValue === time.value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'hover:bg-muted'
                  )}
                  data-value={time.value}
                  key={time.value}
                  onClick={() => handleTimeSelect(time.value)}
                  size="sm"
                  variant={
                    currentTimeValue === time.value ? 'default' : 'ghost'
                  }
                >
                  {time.label}
                </Button>
              ))}
            </div>
            <ScrollBar orientation="vertical" />
          </ScrollArea>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            className="flex-1"
            onClick={() => popModal()}
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              popModal();
              onChange(selectedDate);
            }}
          >
            Confirm Selection
          </Button>
        </div>
      </div>
    </ModalContent>
  );
}

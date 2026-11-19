import { PopoverPortal } from '@radix-ui/react-popover';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export function DateTimePicker({
  value,
  onChange,
}: {
  value: Date;
  onChange: (date: Date) => void;
}) {
  function handleDateSelect(date: Date | undefined) {
    if (date) {
      onChange(date);
    }
  }

  function handleTimeChange(type: 'hour' | 'minute', value: string) {
    const currentDate = value || new Date();
    const newDate = new Date(currentDate);

    if (type === 'hour') {
      const hour = Number.parseInt(value, 10);
      newDate.setHours(hour);
    } else if (type === 'minute') {
      newDate.setMinutes(Number.parseInt(value, 10));
    }

    onChange(newDate);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            'w-full pl-3 text-left font-normal',
            !value && 'text-muted-foreground'
          )}
          variant={'outline'}
        >
          {value ? (
            format(value, 'MM/dd/yyyy HH:mm')
          ) : (
            <span>MM/DD/YYYY HH:mm</span>
          )}
          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverPortal>
        <PopoverContent className="w-auto p-0">
          <div className="sm:flex">
            <Calendar
              initialFocus
              mode="single"
              onSelect={handleDateSelect}
              selected={value}
            />
            <div className="flex flex-col divide-y sm:h-[300px] sm:flex-row sm:divide-x sm:divide-y-0">
              <ScrollArea className="w-64 sm:w-auto">
                <div className="flex p-2 sm:flex-col">
                  {Array.from({ length: 24 }, (_, i) => i)
                    .reverse()
                    .map((hour) => (
                      <Button
                        className="aspect-square shrink-0 sm:w-full"
                        key={hour}
                        onClick={() =>
                          handleTimeChange('hour', hour.toString())
                        }
                        size="icon"
                        variant={
                          value && value.getHours() === hour
                            ? 'default'
                            : 'ghost'
                        }
                      >
                        {hour}
                      </Button>
                    ))}
                </div>
                <ScrollBar className="sm:hidden" orientation="horizontal" />
              </ScrollArea>
              <ScrollArea className="w-64 sm:w-auto">
                <div className="flex p-2 sm:flex-col">
                  {Array.from({ length: 12 }, (_, i) => i * 5).map((minute) => (
                    <Button
                      className="aspect-square shrink-0 sm:w-full"
                      key={minute}
                      onClick={() =>
                        handleTimeChange('minute', minute.toString())
                      }
                      size="icon"
                      variant={
                        value && value.getMinutes() === minute
                          ? 'default'
                          : 'ghost'
                      }
                    >
                      {minute.toString().padStart(2, '0')}
                    </Button>
                  ))}
                </div>
                <ScrollBar className="sm:hidden" orientation="horizontal" />
              </ScrollArea>
            </div>
          </div>
        </PopoverContent>
      </PopoverPortal>
    </Popover>
  );
}

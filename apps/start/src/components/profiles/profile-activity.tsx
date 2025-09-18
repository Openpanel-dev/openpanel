import { Widget, WidgetBody } from '@/components/widget';
import { cn } from '@/utils/cn';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  formatISO,
  isSameMonth,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { ActivityIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import {
  WidgetAbsoluteButtons,
  WidgetHead,
  WidgetTitle,
} from '../overview/overview-widget';
import { Button } from '../ui/button';

type Props = {
  data: { count: number; date: string }[];
};

const MonthCalendar = ({
  month,
  data,
}: { month: Date; data: Props['data'] }) => (
  <div>
    <div className="mb-2 text-sm">{format(month, 'MMMM yyyy')}</div>
    <div className="-m-1 grid grid-cols-7 gap-1 p-1">
      {eachDayOfInterval({
        start: startOfMonth(month),
        end: endOfMonth(month),
      }).map((date) => {
        const hit = data.find((item) =>
          item.date.includes(formatISO(date, { representation: 'date' })),
        );
        return (
          <div
            key={date.toISOString()}
            className={cn(
              'aspect-square w-full rounded',
              hit ? 'bg-highlight' : 'bg-def-200',
            )}
          />
        );
      })}
    </div>
  </div>
);

export const ProfileActivity = ({ data }: Props) => {
  const [startDate, setStartDate] = useState(startOfMonth(new Date()));

  return (
    <Widget className="w-full">
      <WidgetHead className="row justify-between relative">
        <WidgetTitle icon={ActivityIcon}>Activity</WidgetTitle>
        <WidgetAbsoluteButtons>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setStartDate(subMonths(startDate, 1))}
          >
            <ChevronLeftIcon size={14} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={isSameMonth(startDate, new Date())}
            onClick={() => setStartDate(addMonths(startDate, 1))}
          >
            <ChevronRightIcon size={14} />
          </Button>
        </WidgetAbsoluteButtons>
      </WidgetHead>
      <WidgetBody>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[3, 2, 1, 0].map((offset) => (
            <MonthCalendar
              key={offset}
              month={subMonths(startDate, offset)}
              data={data}
            />
          ))}
        </div>
      </WidgetBody>
    </Widget>
  );
};

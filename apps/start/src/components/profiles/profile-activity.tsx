import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  formatISO,
  isSameMonth,
  isToday,
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
import { Tooltiper } from '../ui/tooltip';
import { Widget, WidgetBody } from '@/components/widget';
import { cn } from '@/utils/cn';

type Props = {
  data: { count: number; date: string }[];
};

function getOpacityLevel(count: number, maxCount: number): number {
  if (count === 0 || maxCount === 0) {
    return 0;
  }
  const ratio = count / maxCount;
  if (ratio <= 0.25) {
    return 0.25;
  }
  if (ratio <= 0.5) {
    return 0.5;
  }
  if (ratio <= 0.75) {
    return 0.75;
  }
  return 1;
}

const MonthCalendar = ({
  month,
  data,
  maxCount,
}: {
  month: Date;
  data: Props['data'];
  maxCount: number;
}) => (
  <div>
    <div className="mb-2 text-sm">{format(month, 'MMMM yyyy')}</div>
    <div className="-m-1 grid grid-cols-7 gap-1 p-1">
      {eachDayOfInterval({
        start: startOfMonth(month),
        end: endOfMonth(month),
      }).map((date) => {
        const hit = data.find((item) =>
          item.date.includes(formatISO(date, { representation: 'date' }))
        );
        const opacity = hit ? getOpacityLevel(hit.count, maxCount) : 0;
        return (
          <Tooltiper
            asChild
            content={
              <div className="col gap-1 text-sm">
                <div className="font-medium">{format(date, 'EEEE, MMM d')}</div>
                {hit ? (
                  <div className="text-muted-foreground">
                    {hit.count} {hit.count === 1 ? 'event' : 'events'}
                  </div>
                ) : (
                  <div className="text-muted-foreground">No activity</div>
                )}
              </div>
            }
            key={date.toISOString()}
          >
            <div
              className={cn(
                'group aspect-square w-full cursor-default overflow-hidden rounded hover:ring-1 hover:ring-foreground'
              )}
            >
              <div
                className={cn(
                  'size-full rounded group-hover:shadow-[inset_0_0_0_2px_var(--background)]',
                  isToday(date)
                    ? 'bg-highlight'
                    : hit
                      ? 'bg-foreground'
                      : 'bg-def-200'
                )}
                style={hit && !isToday(date) ? { opacity } : undefined}
              />
            </div>
          </Tooltiper>
        );
      })}
    </div>
  </div>
);

export const ProfileActivity = ({ data }: Props) => {
  const [startDate, setStartDate] = useState(startOfMonth(new Date()));
  const maxCount = Math.max(...data.map((item) => item.count), 0);

  return (
    <Widget className="w-full">
      <WidgetHead className="row relative justify-between">
        <WidgetTitle icon={ActivityIcon}>Activity</WidgetTitle>
        <WidgetAbsoluteButtons>
          <Button
            onClick={() => setStartDate(subMonths(startDate, 1))}
            size="icon"
            variant="outline"
          >
            <ChevronLeftIcon size={14} />
          </Button>
          <Button
            disabled={isSameMonth(startDate, new Date())}
            onClick={() => setStartDate(addMonths(startDate, 1))}
            size="icon"
            variant="outline"
          >
            <ChevronRightIcon size={14} />
          </Button>
        </WidgetAbsoluteButtons>
      </WidgetHead>
      <WidgetBody>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[3, 2, 1, 0].map((offset) => (
            <MonthCalendar
              data={data}
              key={offset}
              maxCount={maxCount}
              month={subMonths(startDate, offset)}
            />
          ))}
        </div>
      </WidgetBody>
    </Widget>
  );
};

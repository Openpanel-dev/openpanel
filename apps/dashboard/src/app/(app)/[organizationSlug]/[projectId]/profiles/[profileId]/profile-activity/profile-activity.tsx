'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Widget,
  WidgetBody,
  WidgetHead,
  WidgetTitle,
} from '@/components/widget';
import { cn } from '@/utils/cn';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { ActivityIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

type Props = {
  data: { count: number; date: string }[];
};

const ProfileActivity = ({ data }: Props) => {
  const [startDate, setStartDate] = useState(startOfMonth(new Date()));
  const endDate = endOfMonth(startDate);
  return (
    <Widget className="w-full">
      <WidgetHead className="flex justify-between">
        <WidgetTitle icon={ActivityIcon}>Activity</WidgetTitle>
        <div className="flex gap-2">
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
            onClick={() => setStartDate(addMonths(startDate, 1))}
          >
            <ChevronRightIcon size={14} />
          </Button>
        </div>
      </WidgetHead>
      <WidgetBody className="p-0">
        <div className="grid grid-cols-2">
          <div>
            <div className="p-1 text-xs">
              {format(subMonths(startDate, 1), 'MMMM yyyy')}
            </div>
            <div className="grid grid-cols-7 gap-1 p-1">
              {eachDayOfInterval({
                start: startOfMonth(subMonths(startDate, 1)),
                end: endOfMonth(subMonths(startDate, 1)),
              }).map((date) => {
                const hit = data.find((item) =>
                  item.date.includes(date.toISOString().split('T')[0])
                );
                return (
                  <div
                    key={date.toISOString()}
                    className={cn(
                      'aspect-square w-full rounded',
                      hit ? 'bg-blue-600' : 'bg-slate-100'
                    )}
                  ></div>
                );
              })}
            </div>
          </div>
          <div>
            <div className="p-1 text-xs">{format(startDate, 'MMMM yyyy')}</div>
            <div className="grid grid-cols-7 gap-1 p-1">
              {eachDayOfInterval({
                start: startDate,
                end: endDate,
              }).map((date) => {
                const hit = data.find((item) =>
                  item.date.includes(date.toISOString().split('T')[0])
                );
                return (
                  <div
                    key={date.toISOString()}
                    className={cn(
                      'aspect-square w-full rounded',
                      hit ? 'bg-blue-600' : 'bg-slate-100'
                    )}
                  ></div>
                );
              })}
            </div>
          </div>
        </div>
      </WidgetBody>
    </Widget>
  );
};

export default ProfileActivity;

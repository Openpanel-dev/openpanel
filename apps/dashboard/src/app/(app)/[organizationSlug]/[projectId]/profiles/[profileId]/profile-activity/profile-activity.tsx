'use client';

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
  formatISO,
  isSameMonth,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { ActivityIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';

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
            disabled={isSameMonth(startDate, new Date())}
            onClick={() => setStartDate(addMonths(startDate, 1))}
          >
            <ChevronRightIcon size={14} />
          </Button>
        </div>
      </WidgetHead>
      <WidgetBody>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <div className="mb-2 text-sm">
              {format(subMonths(startDate, 3), 'MMMM yyyy')}
            </div>
            <div className="-m-1 grid grid-cols-7 gap-1 p-1">
              {eachDayOfInterval({
                start: startOfMonth(subMonths(startDate, 3)),
                end: endOfMonth(subMonths(startDate, 3)),
              }).map((date) => {
                const hit = data.find((item) =>
                  item.date.includes(
                    formatISO(date, { representation: 'date' }),
                  ),
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
          <div>
            <div className="mb-2 text-sm">
              {format(subMonths(startDate, 2), 'MMMM yyyy')}
            </div>
            <div className="-m-1 grid grid-cols-7 gap-1 p-1">
              {eachDayOfInterval({
                start: startOfMonth(subMonths(startDate, 2)),
                end: endOfMonth(subMonths(startDate, 2)),
              }).map((date) => {
                const hit = data.find((item) =>
                  item.date.includes(
                    formatISO(date, { representation: 'date' }),
                  ),
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
          <div>
            <div className="mb-2 text-sm">
              {format(subMonths(startDate, 1), 'MMMM yyyy')}
            </div>
            <div className="-m-1 grid grid-cols-7 gap-1 p-1">
              {eachDayOfInterval({
                start: startOfMonth(subMonths(startDate, 1)),
                end: endOfMonth(subMonths(startDate, 1)),
              }).map((date) => {
                const hit = data.find((item) =>
                  item.date.includes(
                    formatISO(date, { representation: 'date' }),
                  ),
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
          <div>
            <div className="mb-2 text-sm">{format(startDate, 'MMMM yyyy')}</div>
            <div className="-m-1 grid grid-cols-7 gap-1 p-1">
              {eachDayOfInterval({
                start: startDate,
                end: endDate,
              }).map((date) => {
                const hit = data.find((item) =>
                  item.date.includes(
                    formatISO(date, { representation: 'date' }),
                  ),
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
        </div>
      </WidgetBody>
    </Widget>
  );
};

export default ProfileActivity;

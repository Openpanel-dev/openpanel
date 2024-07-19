import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { cn } from '@/utils/cn';
import { escape } from 'sqlstring';

import { chQuery, TABLE_NAMES } from '@openpanel/db';

interface Props {
  projectId: string;
}

export default async function ProfileLastSeenServer({ projectId }: Props) {
  interface Row {
    days: number;
    count: number;
  }
  // Days since last event from users
  // group by days
  const res = await chQuery<Row>(
    `SELECT age('days',created_at, now()) as days, count(distinct profile_id) as count FROM ${TABLE_NAMES.events} where project_id = ${escape(projectId)} group by days order by days ASC LIMIT 51`
  );

  const maxValue = Math.max(...res.map((x) => x.count));
  const minValue = Math.min(...res.map((x) => x.count));
  const calculateRatio = (currentValue: number) =>
    Math.max(
      0.1,
      Math.min(1, (currentValue - minValue) / (maxValue - minValue))
    );

  const renderItem = (item: Row) => (
    <div className="flex w-1/12 flex-col items-center p-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn('aspect-square w-full shrink-0 rounded bg-highlight')}
            style={{
              opacity: calculateRatio(item.count),
            }}
          ></div>
        </TooltipTrigger>
        <TooltipContent>
          {item.count} profiles last seen{' '}
          {item.days === 0 ? 'today' : `${item.days} days ago`}
        </TooltipContent>
      </Tooltip>
      <div className="mt-1 text-[10px]">{item.days}</div>
    </div>
  );

  return (
    <Widget className="w-full">
      <WidgetHead>
        <div className="title">Last seen</div>
      </WidgetHead>
      <WidgetBody>
        <div className="flex w-full flex-wrap items-start justify-start">
          {res.map(renderItem)}
        </div>
        <div className="text-center text-xs text-muted-foreground">DAYS</div>
      </WidgetBody>
    </Widget>
  );
}

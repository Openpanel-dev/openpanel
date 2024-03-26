import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Widget, WidgetBody, WidgetHead } from '@/components/widget';
import { cn } from '@/utils/cn';

import { chQuery } from '@openpanel/db';

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
    `SELECT age('days',created_at, now()) as days, count(distinct profile_id) as count FROM events where project_id = '${projectId}' group by days order by days ASC`
  );

  const take = 18;
  const split = take / 2;
  const max = Math.max(...res.map((item) => item.count));
  const renderItem = (item: Row) => (
    <div
      key={item.days}
      className="flex h-full flex-1 shrink-0 flex-col items-center"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex w-full flex-1 flex-col justify-end rounded bg-slate-200">
            <div
              className={cn(
                'w-full rounded',
                item.days < split ? 'bg-blue-600' : 'bg-blue-400'
              )}
              style={{
                height: `${(item.count / max) * 100}%`,
              }}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {item.count} profiles last seen{' '}
          {item.days === 0 ? 'today' : `${item.days} days ago`}
        </TooltipContent>
      </Tooltip>
      <div className="mt-1 text-xs">{item.days}</div>
    </div>
  );
  return (
    <Widget className="w-full">
      <WidgetHead>
        <div className="title">Last seen</div>
      </WidgetHead>
      <WidgetBody>
        <div className="flex aspect-[3/1] w-full items-end gap-1">
          {res.length >= 18 ? (
            <>
              {res.slice(0, split).map(renderItem)}
              {res.slice(-split).map(renderItem)}
            </>
          ) : (
            res.map(renderItem)
          )}
        </div>
        <div className="text-center text-xs text-muted-foreground">DAYS</div>
      </WidgetBody>
    </Widget>
  );
}

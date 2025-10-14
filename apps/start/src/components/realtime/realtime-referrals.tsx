'use client';

import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { prop, uniqBy } from 'ramda';
import { OverviewWidgetTable } from '../overview/overview-widget-table';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Tooltiper } from '../ui/tooltip';

interface RealtimeReferralsProps {
  projectId: string;
}

export function RealtimeReferrals({ projectId }: RealtimeReferralsProps) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.realtime.referrals.queryOptions({
      projectId,
    }),
  );

  const data = query.data ?? [];
  const maxCount = Math.max(...data.map((item) => item.count));
  const number = useNumber();
  const unique = uniqBy(prop('referrer_name'), data)
    .filter((i) => !!i.referrer_name.trim())
    .slice(0, 8);

  return (
    <div className="col h-full card">
      <div className="row justify-between items-center p-4 pb-0">
        <div className="font-medium text-muted-foreground">Referrals</div>
        <div className="row gap-1">
          {unique.map((item) => (
            <Tooltiper key={item.referrer_name} content={item.referrer_name}>
              <SerieIcon key={item.referrer_name} name={item.referrer_name} />
            </Tooltiper>
          ))}
        </div>
      </div>
      <OverviewWidgetTable
        data={data ?? []}
        keyExtractor={(item) => item.referrer_name}
        getColumnPercentage={(item) => item.count / maxCount}
        columns={[
          {
            name: 'Referrer',
            width: 'w-full',
            render(item) {
              return (
                <Tooltiper asChild content={item.referrer_name} side="left">
                  <div className="row items-center gap-2 min-w-0 relative">
                    <SerieIcon name={item.referrer_name} />
                    {item.referrer_name || '(Not set)'}
                  </div>
                </Tooltiper>
              );
            },
          },
          {
            name: 'Duration',
            width: '75px',
            render(item) {
              return number.shortWithUnit(item.avg_duration, 'min');
            },
          },
          {
            name: 'Events',
            width: '84px',
            render(item) {
              return (
                <div className="row gap-2 justify-end">
                  <span className="font-semibold">
                    {number.short(item.count)}
                  </span>
                </div>
              );
            },
          },
        ]}
      />
    </div>
  );
}

'use client';

import { useNumber } from '@/hooks/useNumerFormatter';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
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

  return (
    <div className="col h-full card">
      <div className="font-medium text-muted-foreground p-4 pb-0">
        Referrals
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

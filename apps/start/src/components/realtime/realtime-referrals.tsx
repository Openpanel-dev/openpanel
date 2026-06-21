import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { prop, uniqBy } from 'ramda';
import { OverviewWidgetTable } from '../overview/overview-widget-table';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Tooltiper } from '../ui/tooltip';
import { useTranslation } from 'react-i18next';

interface RealtimeReferralsProps {
  projectId: string;
}

export function RealtimeReferrals({ projectId }: RealtimeReferralsProps) {
  const { t } = useTranslation();
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
        <div className="font-medium text-muted-foreground">{t('realtime.referrals_title')}</div>
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
            name: t('realtime.column_referrer'),
            width: 'w-full',
            responsive: { priority: 1 },
            render(item) {
              return (
                <Tooltiper asChild content={item.referrer_name} side="left">
                  <div className="row items-center gap-2 min-w-0 relative">
                    <SerieIcon name={item.referrer_name} />
                    {item.referrer_name || t('realtime.not_set')}
                  </div>
                </Tooltiper>
              );
            },
          },
          {
            name: t('realtime.column_duration'),
            width: '75px',
            responsive: { priority: 7 },
            render(item) {
              return number.shortWithUnit(item.avg_duration, 'min');
            },
          },
          {
            name: t('realtime.column_events'),
            width: '60px',
            responsive: { priority: 4 },
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
          {
            name: t('realtime.column_sessions'),
            width: '82px',
            responsive: { priority: 2 },
            render(item) {
              return (
                <div className="row gap-2 justify-end">
                  <span className="font-semibold">
                    {number.short(item.unique_sessions)}
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

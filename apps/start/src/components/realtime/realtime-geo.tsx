import { useQuery } from '@tanstack/react-query';
import { prop, uniqBy } from 'ramda';
import { OverviewWidgetTable } from '../overview/overview-widget-table';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { Tooltiper } from '../ui/tooltip';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import { countries } from '@/translations/countries';

interface RealtimeGeoProps {
  projectId: string;
}

export function RealtimeGeo({ projectId }: RealtimeGeoProps) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.realtime.geo.queryOptions({
      projectId,
    })
  );

  const data = query.data ?? [];
  const maxCount = Math.max(...data.map((item) => item.count));
  const number = useNumber();

  // Get unique countries for header icons
  const unique = uniqBy(prop('country'), data)
    .filter((i) => !!i.country.trim())
    .slice(0, 8);

  return (
    <div className="col card h-full">
      <div className="row items-center justify-between p-4 pb-0">
        <div className="font-medium text-muted-foreground">Geo</div>
        <div className="row gap-1">
          {unique.map((item) => (
            <Tooltiper
              content={countries[item.country as keyof typeof countries]}
              key={item.country}
            >
              <SerieIcon key={item.country} name={item.country} />
            </Tooltiper>
          ))}
        </div>
      </div>
      <OverviewWidgetTable
        columns={[
          {
            name: 'Country / City',
            width: 'w-full',
            responsive: { priority: 1 },
            render(item) {
              return (
                <Tooltiper
                  asChild
                  content={`${item.country} / ${item.city}`}
                  side="left"
                >
                  <div className="row relative min-w-0 items-center gap-2">
                    <SerieIcon name={item.country} />
                    {item.city || '(Not set)'}
                  </div>
                </Tooltiper>
              );
            },
          },
          {
            name: 'Duration',
            width: '75px',
            responsive: { priority: 7 },
            render(item) {
              return number.shortWithUnit(item.avg_duration, 'min');
            },
          },
          {
            name: 'Events',
            width: '60px',
            responsive: { priority: 4 },
            render(item) {
              return (
                <div className="row justify-end gap-2">
                  <span className="font-semibold">
                    {number.short(item.count)}
                  </span>
                </div>
              );
            },
          },
          {
            name: 'Sessions',
            width: '82px',
            responsive: { priority: 2 },
            render(item) {
              return (
                <div className="row justify-end gap-2">
                  <span className="font-semibold">
                    {number.short(item.unique_sessions)}
                  </span>
                </div>
              );
            },
          },
        ]}
        data={data ?? []}
        getColumnPercentage={(item) => item.count / maxCount}
        keyExtractor={(item) => item.country + item.city}
      />
    </div>
  );
}

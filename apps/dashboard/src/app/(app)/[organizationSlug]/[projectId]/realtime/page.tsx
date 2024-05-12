import { Suspense } from 'react';
import { LazyChart } from '@/components/report/chart/LazyChart';

import PageLayout from '../page-layout';
import RealtimeMap from './map';
import RealtimeLiveEventsServer from './realtime-live-events';
import { RealtimeLiveHistogram } from './realtime-live-histogram';
import RealtimeReloader from './realtime-reloader';

type Props = {
  params: {
    organizationSlug: string;
    projectId: string;
  };
};
export default function Page({
  params: { projectId, organizationSlug },
}: Props) {
  return (
    <div className="">
      <RealtimeReloader projectId={projectId} />
      <PageLayout title="Realtime" {...{ projectId, organizationSlug }} />
      <Suspense>
        <RealtimeMap projectId={projectId} />
      </Suspense>
      <div className="pointer-events-none relative z-10 w-full overflow-hidden">
        <div className="pointer-events-none grid min-h-[calc(100vh-theme(spacing.16))] items-start gap-4 p-8 md:grid-cols-3">
          <div className="card bg-background/80 p-4">
            <RealtimeLiveHistogram projectId={projectId} />
          </div>
          <div className="pointer-events-auto col-span-2">
            <RealtimeLiveEventsServer projectId={projectId} limit={5} />
          </div>
        </div>
        <div className="-mt-32 grid gap-4 p-8 md:grid-cols-3">
          <div className="card p-4">
            <div className="mb-6">
              <div className="font-bold">Pages</div>
            </div>
            <LazyChart
              hideID
              {...{
                projectId,
                events: [
                  {
                    filters: [],
                    segment: 'event',
                    id: 'A',
                    name: 'screen_view',
                  },
                ],
                breakdowns: [
                  {
                    id: 'A',
                    name: 'path',
                  },
                ],
                chartType: 'bar',
                lineType: 'monotone',
                interval: 'minute',
                name: 'Top sources',
                range: '30min',
                previous: false,
                metric: 'sum',
              }}
            />
          </div>
          <div className="card p-4">
            <div className="mb-6">
              <div className="font-bold">Cities</div>
            </div>
            <LazyChart
              hideID
              {...{
                projectId,
                events: [
                  {
                    segment: 'event',
                    filters: [],
                    id: 'A',
                    name: 'session_start',
                  },
                ],
                breakdowns: [
                  {
                    id: 'A',
                    name: 'city',
                  },
                ],
                chartType: 'bar',
                lineType: 'monotone',
                interval: 'minute',
                name: 'Top sources',
                range: '30min',
                previous: false,
                metric: 'sum',
              }}
            />
          </div>
          <div className="card p-4">
            <div className="mb-6">
              <div className="font-bold">Referrers</div>
            </div>
            <LazyChart
              hideID
              {...{
                projectId,
                events: [
                  {
                    segment: 'event',
                    filters: [],
                    id: 'A',
                    name: 'session_start',
                  },
                ],
                breakdowns: [
                  {
                    id: 'A',
                    name: 'referrer_name',
                  },
                ],
                chartType: 'bar',
                lineType: 'monotone',
                interval: 'minute',
                name: 'Top sources',
                range: '30min',
                previous: false,
                metric: 'sum',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

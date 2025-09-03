import {
  Fullscreen,
  FullscreenClose,
  FullscreenOpen,
} from '@/components/fullscreen-toggle';
import { ReportChart } from '@/components/report-chart';
import { Suspense } from 'react';

import RealtimeMap from './map';
import RealtimeLiveEventsServer from './realtime-live-events';
import { RealtimeLiveHistogram } from './realtime-live-histogram';
import RealtimeReloader from './realtime-reloader';

type Props = {
  params: {
    projectId: string;
  };
};
export default function Page({ params: { projectId } }: Props) {
  return (
    <>
      <Fullscreen>
        <FullscreenClose />
        <RealtimeReloader projectId={projectId} />
        <Suspense>
          <RealtimeMap projectId={projectId} />
        </Suspense>

        <div className="row relative z-10 min-h-screen items-start gap-4 overflow-hidden p-8">
          <FullscreenOpen />
          <div className="card min-w-52 bg-card/80 p-4 md:min-w-80">
            <RealtimeLiveHistogram projectId={projectId} />
          </div>
          <div className="col-span-2">
            <RealtimeLiveEventsServer projectId={projectId} limit={5} />
          </div>
        </div>
        <div className="relative z-10 -mt-32 grid gap-4 p-8 md:grid-cols-3">
          <div className="card p-4">
            <div className="mb-6">
              <div className="font-bold">Pages</div>
            </div>
            <ReportChart
              options={{
                hideID: true,
              }}
              report={{
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
            <ReportChart
              options={{
                hideID: true,
              }}
              report={{
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
            <ReportChart
              options={{
                hideID: true,
              }}
              report={{
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
      </Fullscreen>
    </>
  );
}

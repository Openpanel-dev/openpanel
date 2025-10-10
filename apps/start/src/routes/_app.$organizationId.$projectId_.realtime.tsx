import { Fullscreen, FullscreenClose } from '@/components/fullscreen-toggle';
import RealtimeMap from '@/components/realtime/map';
import { RealtimeActiveSessions } from '@/components/realtime/realtime-active-sessions';
import { RealtimeGeo } from '@/components/realtime/realtime-geo';
import { RealtimeLiveHistogram } from '@/components/realtime/realtime-live-histogram';
import { RealtimePaths } from '@/components/realtime/realtime-paths';
import { RealtimeReferrals } from '@/components/realtime/realtime-referrals';
import RealtimeReloader from '@/components/realtime/realtime-reloader';
import { useTRPC } from '@/integrations/trpc/react';
import { PAGE_TITLES, createProjectTitle } from '@/utils/title';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId_/realtime',
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.REALTIME),
        },
      ],
    };
  },
});

function Component() {
  const { projectId } = Route.useParams();
  const trpc = useTRPC();
  const coordinatesQuery = useQuery(
    trpc.realtime.coordinates.queryOptions(
      {
        projectId,
      },
      {
        placeholderData: keepPreviousData,
      },
    ),
  );

  return (
    <>
      <Fullscreen>
        <FullscreenClose />
        <RealtimeReloader projectId={projectId} />

        <div className="row relative">
          <div className="overflow-hidden aspect-[4/2] w-full">
            <RealtimeMap
              markers={coordinatesQuery.data ?? []}
              sidebarConfig={{
                width: 280, // w-96 = 384px
                position: 'left',
              }}
            />
          </div>
          <div className="absolute top-8 left-8 bottom-0 col gap-4">
            <div className="card p-4 w-72 bg-background/90">
              <RealtimeLiveHistogram projectId={projectId} />
            </div>
            <div className="w-72 flex-1 min-h-0 relative">
              <RealtimeActiveSessions projectId={projectId} />
              <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-def-100 to-transparent" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 p-8 pt-0">
          <div>
            <RealtimeGeo projectId={projectId} />
          </div>
          <div>
            <RealtimeReferrals projectId={projectId} />
          </div>
          <div>
            <RealtimePaths projectId={projectId} />
          </div>
        </div>

        {/* <div className="row gap-4 p-8">
          <div className="card p-4 w-96">
            <RealtimeLiveHistogram projectId={projectId} />
          </div>
          <div className="card p-8 flex-1">
            <div className="font-medium text-muted-foreground">Paths</div>
          </div>
          <div className="card p-8 flex-1">
            <div className="font-medium text-muted-foreground">Geo</div>
          </div>
          <div className="card p-8 flex-1">
            <div className="font-medium text-muted-foreground">Referrals</div>
          </div>
        </div>

        <div className="row flex-1 p-8 gap-4 pt-0">
          <div className="w-96">
            <div className="card p-8">Active sessions</div>
          </div>
          <div className="flex-1">Map</div>
        </div> */}

        {/* <RealtimeMap markers={coordinatesQuery.data ?? []} /> */}

        {/* <div className="row relative z-10 min-h-screen items-start gap-4 overflow-hidden p-8">
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
        </div> */}
      </Fullscreen>
    </>
  );
}

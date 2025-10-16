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
      </Fullscreen>
    </>
  );
}

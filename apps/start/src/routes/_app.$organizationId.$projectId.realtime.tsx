import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Fullscreen, FullscreenClose } from '@/components/fullscreen-toggle';
import RealtimeMap from '@/components/realtime/map';
import { RealtimeActiveSessions } from '@/components/realtime/realtime-active-sessions';
import { RealtimeGeo } from '@/components/realtime/realtime-geo';
import { RealtimeLiveHistogram } from '@/components/realtime/realtime-live-histogram';
import { RealtimePaths } from '@/components/realtime/realtime-paths';
import { RealtimeReferrals } from '@/components/realtime/realtime-referrals';
import RealtimeReloader from '@/components/realtime/realtime-reloader';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/realtime'
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
      }
    )
  );

  return (
    <>
      <Fullscreen>
        <FullscreenClose />
        <RealtimeReloader projectId={projectId} />

        <div className="row relative">
          <div className="aspect-[4/2] w-full overflow-hidden">
            <RealtimeMap
              markers={coordinatesQuery.data ?? []}
              sidebarConfig={{
                width: 280, // w-96 = 384px
                position: 'left',
              }}
            />
          </div>
          <div className="col absolute top-8 bottom-4 left-8 gap-4">
            <div className="card w-72 bg-background/90 p-4">
              <RealtimeLiveHistogram projectId={projectId} />
            </div>
            <div className="relative min-h-0 w-72 flex-1">
              <RealtimeActiveSessions projectId={projectId} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-4 pt-4 md:grid-cols-2 md:p-8 md:pt-0 xl:grid-cols-3">
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

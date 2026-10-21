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
    <Fullscreen>
      <FullscreenClose />
      <RealtimeReloader projectId={projectId} />

      <div className="h-[60vh] min-h-[360px] w-full border-b md:h-[70vh]">
        <RealtimeMap
          markers={coordinatesQuery.data ?? []}
          projectId={projectId}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 md:p-8 xl:grid-cols-3">
        <div className="card p-4">
          <RealtimeLiveHistogram projectId={projectId} />
        </div>
        <div className="h-[320px]">
          <RealtimeActiveSessions projectId={projectId} />
        </div>
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
  );
}

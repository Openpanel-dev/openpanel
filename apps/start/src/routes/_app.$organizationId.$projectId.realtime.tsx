import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Fullscreen, FullscreenClose } from '@/components/fullscreen-toggle';
import { OVERLAY_MAP_OVERSCROLL } from '@/components/realtime/live/live-constants';
import { RealtimeLiveOverlays } from '@/components/realtime/live/realtime-live-overlays';
import RealtimeMap from '@/components/realtime/map';
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

      <div className="relative h-svh w-full">
        <RealtimeMap
          markers={coordinatesQuery.data ?? []}
          overscroll={OVERLAY_MAP_OVERSCROLL}
          projectId={projectId}
        />
        <RealtimeLiveOverlays key={projectId} projectId={projectId} />
      </div>
    </Fullscreen>
  );
}

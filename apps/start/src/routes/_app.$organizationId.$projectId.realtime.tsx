import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Fullscreen, FullscreenClose } from '@/components/fullscreen-toggle';
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

      <div className="h-svh w-full">
        <RealtimeMap
          markers={coordinatesQuery.data ?? []}
          projectId={projectId}
        />
      </div>
    </Fullscreen>
  );
}

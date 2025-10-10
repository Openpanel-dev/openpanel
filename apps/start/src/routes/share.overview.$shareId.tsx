import { ShareEnterPassword } from '@/components/auth/share-enter-password';
import { OverviewFiltersButtons } from '@/components/overview/filters/overview-filters-buttons';
import { LiveCounter } from '@/components/overview/live-counter';
import OverviewMetrics from '@/components/overview/overview-metrics';
import { OverviewRange } from '@/components/overview/overview-range';
import OverviewTopDevices from '@/components/overview/overview-top-devices';
import OverviewTopEvents from '@/components/overview/overview-top-events';
import OverviewTopGeo from '@/components/overview/overview-top-geo';
import OverviewTopPages from '@/components/overview/overview-top-pages';
import OverviewTopSources from '@/components/overview/overview-top-sources';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, notFound, useSearch } from '@tanstack/react-router';
import { z } from 'zod';

const shareSearchSchema = z.object({
  header: z.optional(z.number().or(z.string().or(z.boolean()))),
});

export const Route = createFileRoute('/share/overview/$shareId')({
  component: RouteComponent,
  validateSearch: shareSearchSchema,
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.share.overview.queryOptions({
        shareId: params.shareId,
      }),
    );
  },
});

function RouteComponent() {
  const { shareId } = Route.useParams();
  const { header } = useSearch({ from: '/share/overview/$shareId' });
  const trpc = useTRPC();
  const shareQuery = useQuery(
    trpc.share.overview.queryOptions({
      shareId,
    }),
  );

  const hasAccess = shareQuery.data?.hasAccess;
  // Check if share exists and is public
  if (shareQuery.isLoading) {
    return <div>Loading...</div>;
  }

  if (!shareQuery.data) {
    throw notFound();
  }

  if (!shareQuery.data.public) {
    throw notFound();
  }

  const share = shareQuery.data;
  const projectId = share.projectId;

  // Handle password protection
  if (share.password && !hasAccess) {
    return <ShareEnterPassword shareId={share.id} />;
  }

  const isHeaderVisible =
    header !== '0' && header !== 0 && header !== 'false' && header !== false;

  return (
    <div>
      {isHeaderVisible && (
        <div className="flex items-center justify-between border-b border-border bg-background p-4">
          <div className="col gap-1">
            <span className="text-sm">{share.organization?.name}</span>
            <h1 className="text-xl font-medium">{share.project?.name}</h1>
          </div>
          <a
            href="https://openpanel.dev?utm_source=openpanel.dev&utm_medium=share"
            className="col gap-1 items-end"
          >
            <span className="text-xs">POWERED BY</span>
            <span className="text-xl font-medium">openpanel.dev</span>
          </a>
        </div>
      )}
      <div className="">
        <div className="mx-auto max-w-7xl justify-between row gap-4 p-4 pb-0">
          <div className="flex gap-2">
            <OverviewRange />
          </div>
          <div className="flex gap-2">
            <LiveCounter projectId={projectId} />
          </div>
        </div>
        <OverviewFiltersButtons />
        <div className="mx-auto grid max-w-7xl grid-cols-6 gap-4 p-4">
          <OverviewMetrics projectId={projectId} />
          <OverviewTopSources projectId={projectId} />
          <OverviewTopPages projectId={projectId} />
          <OverviewTopDevices projectId={projectId} />
          <OverviewTopEvents projectId={projectId} />
          <OverviewTopGeo projectId={projectId} />
        </div>
      </div>
    </div>
  );
}

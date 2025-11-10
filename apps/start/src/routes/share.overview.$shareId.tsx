import { ShareEnterPassword } from '@/components/auth/share-enter-password';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
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
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import {
  ScriptOnce,
  createFileRoute,
  notFound,
  useSearch,
} from '@tanstack/react-router';
import { EyeClosedIcon, FrownIcon } from 'lucide-react';
import { z } from 'zod';
import '@iframe-resizer/child';

const shareSearchSchema = z.object({
  header: z.optional(z.number().or(z.string().or(z.boolean()))),
});

const iframeResizerScript = `
(function() {
  if (typeof window !== 'undefined' && window.iFrameResizer) {
    window.iFrameResizer.onMessage = function(message) {
      if (message && message.type === 'load-custom-styles') {
        var css = (message.opts && message.opts.styles) || '';
        if (!css) return;
        var style = document.createElement('style');
        style.type = 'text/css';
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
      }
    };
  }
})();
`;

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
  pendingComponent: FullPageLoadingState,
  errorComponent: () => (
    <FullPageEmptyState
      title="Share not found"
      description="The overview you are looking for does not exist."
      className="min-h-[calc(100vh-theme(spacing.16))]"
    />
  ),
});

function RouteComponent() {
  const { shareId } = Route.useParams();
  const { header } = useSearch({ from: '/share/overview/$shareId' });
  const trpc = useTRPC();
  const shareQuery = useSuspenseQuery(
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
    <div style={{ minHeight: '100vh' }}>
      <ScriptOnce>{iframeResizerScript}</ScriptOnce>
      {isHeaderVisible && (
        <div className="mx-auto max-w-7xl justify-between row gap-4 p-4 pb-0">
          <div className="col gap-1">
            <span className="text-sm">{share.organization?.name}</span>
            <h1 className="text-xl font-medium">{share.project?.name}</h1>
          </div>
          <a
            href="https://openpanel.dev?utm_source=openpanel.dev&utm_medium=share"
            className="col gap-1 items-end"
            title="OpenPanel"
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

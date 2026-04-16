import FullPageLoadingState from '@/components/full-page-loading-state';
import ReportEditor from '@/components/report-chart/report-editor';
import { useReportEditorContext } from '@/hooks/use-page-context-helpers';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle } from '@/utils/title';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/reports_/$reportId',
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle('Report'),
        },
      ],
    };
  },
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.report.get.queryOptions({
        reportId: params.reportId,
      }),
    );
  },
  validateSearch: z.object({
    dashboardId: z.string().optional(),
  }),
  pendingComponent: FullPageLoadingState,
});

function Component() {
  const { reportId } = Route.useParams();
  const trpc = useTRPC();
  const query = useSuspenseQuery(trpc.report.get.queryOptions({ reportId }));
  useReportEditorContext(query.data ?? null);
  return <ReportEditor report={query.data} />;
}

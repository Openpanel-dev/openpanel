import ReportEditor from '@/components/report-chart/report-editor';
import { useTRPC } from '@/integrations/trpc/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId_/$projectId_/dashboards_/$dashboardId_/reports_/$reportId',
)({
  component: Component,
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.report.get.queryOptions({
        reportId: params.reportId,
      }),
    );
  },
});

function Component() {
  const { reportId } = Route.useParams();
  const trpc = useTRPC();
  const query = useSuspenseQuery(trpc.report.get.queryOptions({ reportId }));
  return <ReportEditor report={query.data} />;
}

import ReportEditor from '@/components/report-chart/report-editor';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle } from '@/utils/title';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId_/reports_/$reportId',
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
});

function Component() {
  const { reportId } = Route.useParams();
  const trpc = useTRPC();
  const query = useSuspenseQuery(trpc.report.get.queryOptions({ reportId }));
  return <ReportEditor report={query.data} />;
}

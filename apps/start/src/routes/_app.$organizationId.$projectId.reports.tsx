import { zReportInput } from '@openpanel/core/modules/report/report.constants';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import ReportEditor from '@/components/report-chart/report-editor';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/reports'
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(PAGE_TITLES.REPORTS),
        },
      ],
    };
  },
  validateSearch: z.object({
    dashboardId: z.string().optional(),
    /** A report to open unsaved, from a widget's "Open as report". */
    draft: zReportInput.extend({ name: z.string() }).optional(),
  }),
});

function Component() {
  const { draft } = Route.useSearch();
  return <ReportEditor draft={draft} report={null} />;
}

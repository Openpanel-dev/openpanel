import ReportEditor from '@/components/report-chart/report-editor';
import i18n from '@/i18n';
import { createProjectTitle } from '@/utils/title';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/reports',
)({
  component: Component,
  head: () => {
    return {
      meta: [
        {
          title: createProjectTitle(i18n.t('reports.page_title')),
        },
      ],
    };
  },
  validateSearch: z.object({
    dashboardId: z.string().optional(),
  }),
});

function Component() {
  return <ReportEditor report={null} />;
}

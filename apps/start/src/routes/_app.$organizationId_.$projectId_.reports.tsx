import ReportEditor from '@/components/report-chart/report-editor';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

export const Route = createFileRoute(
  '/_app/$organizationId_/$projectId_/reports',
)({
  component: Component,
  validateSearch: z.object({
    dashboardId: z.string().optional(),
  }),
});

function Component() {
  return <ReportEditor report={null} />;
}

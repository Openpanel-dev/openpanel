import ReportEditor from '@/components/report-chart/report-editor';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId_/$projectId_/dashboards_/$dashboardId_/reports',
)({
  component: Component,
});

function Component() {
  return <ReportEditor report={null} />;
}

import { createFileRoute } from '@tanstack/react-router';
import {
  AlertTriangleIcon,
  Building2Icon,
  CpuIcon,
  LayersIcon,
  ServerIcon,
  UsersIcon,
} from 'lucide-react';
import { AiBreakdownWidget } from '@/components/ai/ai-breakdown-widget';
import { AiMetrics } from '@/components/ai/ai-metrics';
import { useTranslation as useDashboardTranslation } from '@/i18n/provider';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/ai/_tabs/'
)({
  component: Component,
});

function Component() {
  const { t: translateUi } = useDashboardTranslation();

  const { projectId } = Route.useParams();
  return (
    <div className="grid grid-cols-6 gap-4">
      <AiMetrics projectId={projectId} />
      <AiBreakdownWidget
        dimension="model"
        icon={CpuIcon}
        projectId={projectId}
        title={translateUi('Cost by model')}
      />
      <AiBreakdownWidget
        dimension="name"
        icon={LayersIcon}
        projectId={projectId}
        title={translateUi('Cost by feature')}
      />
      <AiBreakdownWidget
        dimension="profile"
        icon={UsersIcon}
        projectId={projectId}
        title={translateUi('Top users')}
      />
      <AiBreakdownWidget
        dimension="group"
        icon={Building2Icon}
        projectId={projectId}
        title={translateUi('Top groups')}
      />
      <AiBreakdownWidget
        dimension="provider"
        icon={ServerIcon}
        projectId={projectId}
        title={translateUi('Cost by provider')}
      />
      <AiBreakdownWidget
        dimension="model"
        icon={AlertTriangleIcon}
        measure="errors"
        projectId={projectId}
        secondary="generations"
        title={translateUi('Errors by model')}
      />
    </div>
  );
}

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

export const Route = createFileRoute('/_app/$organizationId/$projectId/ai/_tabs/')({
  component: Component,
});

function Component() {
  const { projectId } = Route.useParams();
  return (
    <div className="grid grid-cols-6 gap-4">
      <AiMetrics projectId={projectId} />
      <AiBreakdownWidget dimension="model" icon={CpuIcon} projectId={projectId} title="Cost by model" />
      <AiBreakdownWidget dimension="name" icon={LayersIcon} projectId={projectId} title="Cost by feature" />
      <AiBreakdownWidget dimension="profile" icon={UsersIcon} projectId={projectId} title="Top users" />
      <AiBreakdownWidget dimension="group" icon={Building2Icon} projectId={projectId} title="Top groups" />
      <AiBreakdownWidget dimension="provider" icon={ServerIcon} projectId={projectId} title="Cost by provider" />
      <AiBreakdownWidget
        dimension="model"
        icon={AlertTriangleIcon}
        measure="errors"
        projectId={projectId}
        secondary="generations"
        title="Errors by model"
      />
    </div>
  );
}

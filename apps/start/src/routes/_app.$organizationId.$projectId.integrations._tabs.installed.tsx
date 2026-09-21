import { createFileRoute } from '@tanstack/react-router';
import { ActiveIntegrations } from '@/components/integrations/active-integrations';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/integrations/_tabs/installed'
)({
  component: Component,
});

function Component() {
  return <ActiveIntegrations />;
}

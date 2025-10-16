import { ActiveIntegrations } from '@/components/integrations/active-integrations';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/integrations/_tabs/installed',
)({
  component: Component,
});

function Component() {
  return <ActiveIntegrations />;
}

import { createFileRoute } from '@tanstack/react-router';
import { AllIntegrations } from '@/components/integrations/all-integrations';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/integrations/_tabs/available'
)({
  component: Component,
});

function Component() {
  return <AllIntegrations />;
}

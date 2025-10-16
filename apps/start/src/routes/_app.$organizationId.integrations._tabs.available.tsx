import { AllIntegrations } from '@/components/integrations/all-integrations';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/integrations/_tabs/available',
)({
  component: Component,
});

function Component() {
  return <AllIntegrations />;
}

import { redirect } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/integrations/_tabs/',
)({
  component: Component,
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$organizationId/integrations/installed',
      params,
    });
  },
});

function Component() {
  return null;
}

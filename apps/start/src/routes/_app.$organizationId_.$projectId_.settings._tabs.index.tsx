import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId_/$projectId_/settings/_tabs/',
)({
  component: Component,
  beforeLoad: () => {
    return redirect({
      from: Route.fullPath,
      to: '/$organizationId/$projectId/settings/details',
    });
  },
});

function Component() {
  return null;
}

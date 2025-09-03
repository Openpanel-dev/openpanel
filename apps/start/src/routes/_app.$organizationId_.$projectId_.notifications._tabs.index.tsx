import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId_/$projectId_/notifications/_tabs/',
)({
  component: Component,
  beforeLoad({ params }) {
    return redirect({
      to: '/$organizationId/$projectId/notifications/notifications',
      params,
    });
  },
});

function Component() {
  return null;
}

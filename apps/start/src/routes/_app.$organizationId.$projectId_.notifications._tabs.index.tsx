import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId_/notifications/_tabs/',
)({
  component: Component,
  beforeLoad({ params }) {
    throw redirect({
      to: '/$organizationId/$projectId/notifications/notifications',
      params,
    });
  },
});

function Component() {
  return null;
}

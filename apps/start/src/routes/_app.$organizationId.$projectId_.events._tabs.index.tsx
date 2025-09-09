import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId_/events/_tabs/',
)({
  component: Component,
  beforeLoad({ params }) {
    return redirect({
      to: '/$organizationId/$projectId/events/events',
      params,
    });
  },
});

function Component() {
  return null;
}
